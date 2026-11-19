'use strict';
/* BIRT Lab Research Digest: public-source editorial builder.
   No subscriber storage, database, AI API, or email sending.
   Production sending remains disabled pending subscription verification and Resend integration. */
const fs=require('node:fs');
const path=require('node:path');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const topics=[
 {name:'Technology Frontiers',query:'("bioprinting" OR "organ-on-chip" OR "biofabrication" OR "bioreactor" OR "biosensor" OR "microfluidic")',max:3},
 {name:'Research Publications',query:'("tissue engineering" OR "regenerative medicine")',max:3},
 {name:'Biomaterials & Scaffolds',query:'("hydrogel" OR "scaffold" OR "biomaterials") AND ("regeneration" OR "tissue")',max:2}
];
const photoLibrary=[
 {topic:'bioprinting',url:'https://images.pexels.com/photos/4031523/pexels-photo-4031523.jpeg?auto=compress&cs=tinysrgb&w=1000',credit:'Edward Jenner / Pexels'},
 {topic:'biomaterials',url:'https://images.pexels.com/photos/8443069/pexels-photo-8443069.jpeg?auto=compress&cs=tinysrgb&w=900',credit:'Pavel Danilyuk / Pexels'},
 {topic:'microfluidics',url:'https://images.pexels.com/photos/4031416/pexels-photo-4031416.jpeg?auto=compress&cs=tinysrgb&w=900',credit:'Edward Jenner / Pexels'},
 {topic:'research',url:'https://images.pexels.com/photos/8533045/pexels-photo-8533045.jpeg?auto=compress&cs=tinysrgb&w=900',credit:'Artem Podrez / Pexels'}
];
function photoFor(p){const title=p.title.toLowerCase();if(/print|fabricat/.test(title))return photoLibrary[0];if(/hydrogel|scaffold|polymer|material/.test(title))return photoLibrary[1];if(/chip|microfluidic|organ/.test(title))return photoLibrary[2];return photoLibrary[3];}
const historyPath=path.join(__dirname,'..','research-digest-data','history.json');
const outDir=path.join(__dirname,'..','research-digest-issues');
const root=path.join(__dirname,'..');
function readHistory(){try{return JSON.parse(fs.readFileSync(historyPath,'utf8'))}catch(e){if(e.code==='ENOENT')return {featured:{},issues:[]};throw e}}
function keyOf(p){return (p.doi?'doi:'+p.doi.toLowerCase():'pmc:'+p.source+':'+p.id).replace(/\s/g,'')}
function weekKey(d){const x=new Date(d);const day=x.getUTCDay();x.setUTCDate(x.getUTCDate()-(day+6)%7);return x.toISOString().slice(0,10)}
async function fetchJson(url,timeout=18000){
 const r=await fetch(url,{headers:{'Accept':'application/json','User-Agent':'BirtLabResearchDigest/1.0 (https://birtlab.com)'},signal:AbortSignal.timeout(timeout)});
 if(!r.ok)throw Error('HTTP '+r.status);
 return r.json();
}
async function search(query){
 const params=new URLSearchParams({query:query+' AND FIRST_PDATE:[NOW-45DAYS TO NOW]',format:'json',pageSize:'30',sort:'FIRST_PDATE_D desc'});
 const endpoint='https://www.ebi.ac.uk/europepmc/webservices/rest/search?'+params;
 for(let attempt=1;attempt<=2;attempt++){
  try{
   const data=await fetchJson(endpoint,20000);
   return (data.resultList?.result||[]).filter(p=>p.title&&p.id&&p.source&&p.firstPublicationDate).map(p=>({
    title:p.title.replace(/<[^>]+>/g,''),source:p.source,id:p.id,date:p.firstPublicationDate,
    journal:p.journalTitle||'',doi:p.doi||'',type:p.source==='PPR'?'PREPRINT · NOT PEER REVIEWED':'INDEXED PUBLICATION',
    url:'https://europepmc.org/article/'+encodeURIComponent(p.source)+'/'+encodeURIComponent(p.id)
   }));
  }catch(err){console.warn('Europe PMC attempt '+attempt+' failed: '+err.message)}
 }
 // OpenAlex provides a secondary live scholarly metadata source when Europe PMC is unavailable.
 // It does not establish peer-review status: label records as scholarly metadata only.
 const keywords=query.includes('bioprinting')?'bioprinting organ on chip biofabrication':query.includes('tissue engineering')?'tissue engineering regenerative medicine':'hydrogel scaffold biomaterials';
 const since=new Date(Date.now()-45*86400000).toISOString().slice(0,10);
 const oa='https://api.openalex.org/works?'+new URLSearchParams({search:keywords,filter:'from_publication_date:'+since,sort:'publication_date:desc',per_page:'30'});
 const data=await fetchJson(oa,20000);
 console.log('Using OpenAlex metadata fallback for '+keywords);
 return (data.results||[]).filter(p=>p.title&&p.id&&p.publication_date).map(p=>({
  title:p.title.replace(/<[^>]+>/g,''),source:'OPENALEX',id:p.id.split('/').pop(),date:p.publication_date,
  journal:p.primary_location?.source?.display_name||'',doi:p.doi?.replace(/^https?:\/\/doi.org\//i,'')||'',
  type:'SCHOLARLY RECORD · REVIEW STATUS UNVERIFIED',
  url:p.doi||p.primary_location?.landing_page_url||p.id
 }));
}

const crypto=require('node:crypto');
const feedPath=path.join(root,'research-digest-data','opportunities.json');
function normalizeTitle(t){return String(t||'').toLowerCase().normalize('NFKC').replace(/[^a-z0-9]+/g,' ').trim();}
function fingerprint(item){return crypto.createHash('sha256').update([item.type||'',item.url||'',normalizeTitle(item.title),item.deadline||'',item.status||''].join('|')).digest('hex');}
function readOpportunities(){try{const d=JSON.parse(fs.readFileSync(feedPath,'utf8'));return Array.isArray(d.items)?d.items:[]}catch(e){if(e.code==='ENOENT')return [];throw e}}
function validOpportunity(o,now){
 if(!o||!['funding','event','collaboration'].includes(o.type)||!o.title||!o.url||!o.verifiedAt||!o.source)return false;
 let u;try{u=new URL(o.url)}catch{return false}
 if(u.protocol!=='https:'||!Number.isFinite(Date.parse(o.verifiedAt)))return false;
 if(Date.now()-Date.parse(o.verifiedAt)>14*86400000)return false;
 if(o.deadline&&(!Number.isFinite(Date.parse(o.deadline))||Date.parse(o.deadline)<now.getTime()))return false;
 return true;
}
function freshOpportunities(history,now){
 const entries=readOpportunities().filter(o=>validOpportunity(o,now));
 const result={funding:[],event:[],collaboration:[]};
 for(const o of entries){
  const fp=fingerprint(o);
  if(history.opportunities?.[fp])continue;
  result[o.type].push({...o,fp});
 }
 return result;
}
function opportunitySection(kind,title,items){
 if(!items.length)return '';
 return section(kind,title,items.map(o=>'<div style="padding:12px 0;border-bottom:1px solid #e2eaeb"><strong>'+esc(o.title)+'</strong><p style="font:13px Arial;color:#637781">'+esc(o.source)+(o.deadline?' · Deadline: '+esc(o.deadline):'')+'</p><a href="'+esc(o.url)+'" style="color:#07838a">OFFICIAL SOURCE →</a></div>').join(''));
}
function trendSection(groups){
 const all=groups.flat(),rules=[['Bioprinting & biofabrication',/bioprint|biofabricat/i],['Smart hydrogels & scaffolds',/hydrogel|scaffold|biomaterial/i],['Organ-on-chip & microfluidics',/organ.on.chip|microfluid/i],['Regenerative cell systems',/cell|regenerat/i]];
 const ranked=rules.map(([label,re])=>({label,count:all.filter(p=>re.test(p.title)).length})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count).slice(0,3);
 if(!ranked.length)return '';
 return section('EMERGING RESEARCH TOPICS','Topics represented in this week’s selected publications',ranked.map(x=>'<p style="font:14px Arial;color:#294f5a"><strong>'+esc(x.label)+'</strong> · '+x.count+' selected record'+(x.count===1?'':'s')+'</p>').join('')+'<p style="font:11px Arial;color:#657984">These counts describe this edition’s selection, not a measured field-wide research trend.</p>');
}

function paper(p,featured=false){
 const photo=photoFor(p);return '<div style="padding:18px 0;border-bottom:1px solid #e5ecee">'+(featured?'<img src="'+esc(photo.url)+'" alt="Illustrative laboratory stock photograph; not an image from this paper" style="display:block;width:100%;height:auto;max-height:270px;object-fit:cover;margin:0 0 14px"><div style="font:11px Arial;color:#6a7d83">Illustrative photograph · '+esc(photo.credit)+'</div>':'')+
 '<div style="font:700 10px Arial;color:#087f82;letter-spacing:1.3px">'+esc(p.type)+' · '+esc(p.date)+'</div>'+
 '<h3 style="font:700 '+(featured?'23':'17')+'px/1.35 Arial;color:#0e2b46;margin:9px 0"><a style="color:#0e2b46;text-decoration:none" href="'+esc(p.url)+'">'+esc(p.title)+'</a></h3>'+
 '<p style="font:13px/1.6 Arial;color:#657984;margin:7px 0">'+esc(p.journal||'Europe PMC record')+(p.doi?' · DOI: '+esc(p.doi):'')+'</p>'+
 '<a style="font:700 12px Arial;color:#007f88" href="'+esc(p.url)+'">READ ORIGINAL PUBLICATION →</a></div>';
}
function section(kicker,title,inner){return '<tr><td style="padding:30px 32px;border-bottom:1px solid #e1e9ed"><div style="font:700 11px Arial;color:#07838a;letter-spacing:2px">'+esc(kicker)+'</div><h2 style="font:700 24px/1.2 Arial;color:#0e2b46;margin:12px 0 10px">'+esc(title)+'</h2>'+inner+'</td></tr>'}
function makeHtml({date,lead,groups,opportunities}){
 const intro='<p style="font:15px/1.7 Arial;color:#536d79;margin:12px 0">A curated view of emerging bioengineering and regenerative technologies. Every publication links to its original indexed record; article titles and metadata are reproduced without AI-generated claims.</p>';
 const tech=groups[0].map(p=>paper(p)).join('');
 const research=groups[1].map(p=>paper(p)).join('');
 const materials=groups[2].map(p=>paper(p)).join('');
 const sections=[
 section('01 / FEATURE STORY','This week in regenerative technology',paper(lead,true)+intro),
 ...(tech?[section('02 / TECHNOLOGY FRONTIERS','Engineering the next generation',tech)]:[]),
 ...(research?[section('03 / LATEST RESEARCH','Selected scientific publications',research)]:[]),
 ...(materials?[section('04 / BIOMATERIALS','Materials and scaffold innovation',materials)]:[]),
 trendSection(groups),
 opportunitySection('RESEARCH GRANTS & FUNDING','New verified funding calls',opportunities.funding),
 opportunitySection('CONFERENCES & EVENTS','New event announcements',opportunities.event),
 opportunitySection('COLLABORATION OPPORTUNITIES','New collaboration calls',opportunities.collaboration)
 ].filter(Boolean).join('');
 // All opportunities are omitted unless newly verified; unchanged BIRT Lab projects are not repeated.
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BIRT Lab Research Digest · '+esc(date)+'</title></head>'+
 '<body style="margin:0;background:#edf3f6;font-family:Arial,sans-serif;color:#0e2b46"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#edf3f6"><tr><td align="center" style="padding:20px 10px">'+
 '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:680px;background:#fff;border-collapse:collapse">'+
 '<tr><td style="padding:23px 32px;border-top:5px solid #07838a;background:#fff"><table role="presentation" width="100%"><tr><td><span style="font:900 28px Arial;color:#0d3241">BIRT<span style="color:#07838a">LAB</span></span><div style="font:10px Arial;color:#5d737e;letter-spacing:.8px">BIOENGINEERING &amp; INTEGRATED<br>REGENERATIVE TECHNOLOGIES LAB</div></td><td align="right" style="font:700 14px Arial;color:#0e2b46">RESEARCH <span style="color:#07838a">DIGEST</span><div style="font:11px Arial;color:#68808a;margin-top:5px">WEEKLY TECHNOLOGY REVIEW<br>'+esc(date)+'</div></td></tr></table></td></tr>'+
 '<tr><td style="background:#0d334a;padding:39px 32px;background-image:linear-gradient(110deg,#0d334a,#076c82)"><div style="font:700 11px Arial;color:#b1f0e7;letter-spacing:2px">FEATURE / BIOENGINEERING INTELLIGENCE</div><h1 style="font:700 36px/1.12 Arial;color:#fff;margin:17px 0">The future of regenerative technologies, in focus.</h1><p style="font:15px/1.6 Arial;color:#d5eff1;margin:0">A weekly review of the science, engineering and platforms shaping tissue repair and biomedical innovation.</p></td></tr>'+
 sections+
 '<tr><td style="background:#0d334a;padding:28px 32px;color:#fff"><div style="font:700 17px Arial">BIRT Lab Research Digest</div><p style="font:12px/1.6 Arial;color:#c8dfe5">Source-grounded scientific discovery · <a href="https://birtlab.com/research-digest-latest.html" style="color:#b8f6ee">Read online</a></p><p style="font:11px/1.6 Arial;color:#c8dfe5">This is an online editorial edition. Email distribution is not yet active. Subscription management and unsubscribe links will be integrated before sending to subscribers.</p></td></tr>'+
 '</table></td></tr></table></body></html>';
}
async function main(){
 const now=new Date();const week=weekKey(now);const history=readHistory();
 history.featured=history.featured||{};history.issues=history.issues||[];history.opportunities=history.opportunities||{};
 if(history.issues.includes(week)&&!process.env.BIRT_DIGEST_FORCE_REBUILD){console.log('Issue already generated for week '+week);return}
 const seen=new Set(),titleSeen=new Set();
 const results=[];
 for(const t of topics){try{results.push(await search(t.query))}catch(err){console.error('Source unavailable for '+t.name+': '+err.message);results.push([])}}
 // Rotate the lead technology category by ISO week; other categories remain eligible.
 const rotation=Math.floor(now.getTime()/604800000)%topics.length;
 const ordered=results.map((items,i)=>items.filter(p=>{
  const k=keyOf(p),t=normalizeTitle(p.title);
  if(seen.has(k)||titleSeen.has(t)||history.featured[k]||history.titles?.[t])return false;
  seen.add(k);titleSeen.add(t);return true;
 }).slice(0,topics[i].max+2));
 const lead=ordered[rotation].shift()||ordered.find(x=>x.length)?.shift();
 if(!lead)throw Error('No new source-verified publications; edition withheld.');
 const groups=ordered.map((items,i)=>items.slice(0,topics[i].max));
 if(groups.flat().length<2)throw Error('Insufficient new verified content; edition withheld.');
 const opportunities=freshOpportunities(history,now);
 const html=makeHtml({date:week,lead,groups,opportunities});
 fs.mkdirSync(outDir,{recursive:true});fs.mkdirSync(path.dirname(historyPath),{recursive:true});
 fs.writeFileSync(path.join(outDir,week+'.html'),html);
 fs.writeFileSync(path.join(root,'research-digest-latest.html'),html);
 history.titles=history.titles||{};
 for(const p of [lead,...groups.flat()]){history.featured[keyOf(p)]={date:week,title:p.title,url:p.url};history.titles[normalizeTitle(p.title)]=week}
 for(const o of Object.values(opportunities).flat())history.opportunities[o.fp]={date:week,title:o.title,url:o.url};
 if(!history.issues.includes(week))history.issues.push(week);
 fs.writeFileSync(historyPath,JSON.stringify(history,null,2)+'\n');
 console.log('Generated issue '+week+' with '+(1+groups.flat().length)+' new source-linked publications and '+Object.values(opportunities).flat().length+' verified opportunity updates. No emails sent.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
