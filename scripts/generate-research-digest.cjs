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


const RELEVANT=/bioprint|biofabricat|tissue.engineer|regenerat|biomaterial|hydrogel|scaffold|microfluid|organ.on.chip|bioreactor|bioink|cell.therap|stem.cell|bone.graft|electrospin|biosensor/i;
const TECH=/bioprint|biofabricat|organ.on.chip|microfluid|bioreactor|bioink|biosensor|electrospin|hydrogel|scaffold|biomaterial/i;
const EXCLUDE=/statistical.analysis.plan|trial.protocol|study.protocol|hospitalisation|case.report|clinical.guideline|survey.of|bibliometric|editorial|correction|erratum|commentary|letter.to.the.editor/i;
function relevance(p,category){
 const title=String(p.title||'');
 if(EXCLUDE.test(title)||!RELEVANT.test(title))return -1;
 const hits=(title.match(/bioprint|biofabricat|tissue.engineer|regenerat|biomaterial|hydrogel|scaffold|microfluid|organ.on.chip|bioreactor|bioink|biosensor/gi)||[]).length;
 if(category===0&&!TECH.test(title))return -1;
 return hits*3+(TECH.test(title)?3:0)+(p.doi?2:0)+(p.source==='PPR'?-1:1);
}
const editionImageLibrary=[
 {id:'microfluidic',url:'https://commons.wikimedia.org/wiki/Special:FilePath/Microfluidic_Chip.jpg?width=900',match:/chip|microfluid|organ.on.chip/i,alt:'Microfluidic chip device, illustrative'},
 {id:'scaffold',url:'https://commons.wikimedia.org/wiki/Special:FilePath/3D_printed_Scaffold_side_view.png?width=900',match:/scaffold|hydrogel|biomaterial|material/i,alt:'Three-dimensional scaffold, illustrative'},
 {id:'bioprinting',url:'https://commons.wikimedia.org/wiki/Special:FilePath/Making_3-D_Bioprinted_Tissue.jpg?width=900',match:/bioprint|biofabricat|bioink|print/i,alt:'Three-dimensional tissue bioprinting, illustrative'},
 {id:'tissue',url:'https://commons.wikimedia.org/wiki/Special:FilePath/3-D_Image_of_Bioprinted_Skin_Tissue_(28746740398).jpg?width=900',match:/tissue|cell|skin|regenerat/i,alt:'Bioprinted skin tissue microscopy image, illustrative'},
 {id:'hydrogel-lab',url:'https://images.pexels.com/photos/8443069/pexels-photo-8443069.jpeg?auto=compress&cs=tinysrgb&w=900',match:/hydrogel|scaffold|biomaterial/i,alt:'Illustrative biomaterials laboratory research photograph'},
 {id:'biomedical-lab',url:'https://images.pexels.com/photos/4031416/pexels-photo-4031416.jpeg?auto=compress&cs=tinysrgb&w=900',match:/cell|tissue|regenerat/i,alt:'Illustrative biomedical laboratory photograph'},
 {id:'bioengineering-lab',url:'https://images.pexels.com/photos/8533045/pexels-photo-8533045.jpeg?auto=compress&cs=tinysrgb&w=900',match:/biofabricat|bioprint|tissue/i,alt:'Illustrative bioengineering laboratory photograph'}
];
function assignEditionImages(slots){
 // Image uniqueness is per VISUAL SLOT, not per publication ID. The same paper
 // may support multiple sections but must never repeat its image on one page.
 const usedUrls=new Set(),assigned=new Map();
 for(const slot of slots){
  const choices=editionImageLibrary.filter(im=>!usedUrls.has(im.url))
   .sort((a,b)=>Number(b.match.test(slot.paper.title))-Number(a.match.test(slot.paper.title)));
  const chosen=choices[0]||null;
  // If the image library is exhausted, render a text-only entry rather than
  // repeat a photograph. This is intentional and guarantees uniqueness.
  if(chosen)usedUrls.add(chosen.url);
  assigned.set(slot.id,chosen);
 }
 return assigned;
}

function paper(p,featured=false){
 const photo=photoFor(p);return '<div style="padding:18px 0;border-bottom:1px solid #e5ecee">'+(featured?'<img src="'+esc(photo.url)+'" alt="Illustrative laboratory stock photograph; not an image from this paper" style="display:block;width:100%;height:auto;max-height:270px;object-fit:cover;margin:0 0 14px"><div style="font:11px Arial;color:#6a7d83">Illustrative photograph · '+esc(photo.credit)+'</div>':'')+
 '<div style="font:700 10px Arial;color:#087f82;letter-spacing:1.3px">'+esc(p.type)+' · '+esc(p.date)+'</div>'+
 '<h3 style="font:700 '+(featured?'23':'17')+'px/1.35 Arial;color:#0e2b46;margin:9px 0"><a style="color:#0e2b46;text-decoration:none" href="'+esc(p.url)+'">'+esc(p.title)+'</a></h3>'+
 '<p style="font:13px/1.6 Arial;color:#657984;margin:7px 0">'+esc(p.journal||'Europe PMC record')+(p.doi?' · DOI: '+esc(p.doi):'')+'</p>'+
 '<a style="font:700 12px Arial;color:#007f88" href="'+esc(p.url)+'">READ ORIGINAL PUBLICATION →</a></div>';
}
function section(kicker,title,inner){return '<tr><td style="padding:30px 32px;border-bottom:1px solid #e1e9ed"><div style="font:700 11px Arial;color:#07838a;letter-spacing:2px">'+esc(kicker)+'</div><h2 style="font:700 24px/1.2 Arial;color:#0e2b46;margin:12px 0 10px">'+esc(title)+'</h2>'+inner+'</td></tr>'}
function emergingTopics(papers){
 const specs=[
  {title:'Smart Scaffolds & Hydrogels',match:/hydrogel|scaffold|biomaterial/i,description:'Selected research examines biomaterial formulations and scaffold designs relevant to tissue engineering.'},
  {title:'Regenerative Tissue Engineering',match:/regenerat|tissue.engineer|cell.therap|stem.cell/i,description:'Selected publications explore approaches to supporting tissue repair, regeneration and engineered tissue systems.'},
  {title:'Advanced Biofabrication',match:/bioprint|biofabricat|bioink|3d.print/i,description:'Recent studies investigate methods and materials used to fabricate engineered biological structures.'},
  {title:'Organ-on-Chip & Microfluidics',match:/organ.on.chip|microfluid/i,description:'Selected studies examine miniaturised platforms for modelling biological systems.'}
 ];
 return specs.map(spec=>({...spec,support:papers.find(p=>spec.match.test(p.title))})).filter(x=>x.support).slice(0,3);
}
function makeHtml({date,lead,groups,opportunities}){
 const tech=groups[0].slice(0,3),pubs=groups[1].slice(0,3),materials=groups[2].slice(0,2);
 const trends=emergingTopics([lead,...groups.flat()]);
 const slots=[{id:'hero',paper:lead},...tech.map((paper,i)=>({id:'tech-'+i,paper})),...trends.map((t,i)=>({id:'trend-'+i,paper:t.support}))];
 const images=assignEditionImages(slots);
 const imageFor=id=>images.get(id);
 const cell=(p,mode='small',slotId='')=>'<div style="padding:10px 0;border-bottom:1px solid #dce8eb">'+
 (mode==='tech'&&imageFor(slotId)?'<img src="'+esc(imageFor(slotId).url)+'" alt="'+esc(imageFor(slotId).alt)+'" style="width:100%;height:130px;object-fit:cover;border-radius:7px;display:block;margin-bottom:10px">':'')+
 '<div style="font:700 10px Arial;color:#00858c;letter-spacing:.6px">'+esc(p.type)+' · '+esc(p.date)+'</div>'+
 '<div style="font:700 '+(mode==='tech'?'15':'13')+'px/1.35 Arial;margin:7px 0"><a style="color:#0c3048;text-decoration:none" href="'+esc(p.url)+'">'+esc(p.title)+'</a></div>'+
 '<div style="font:11px Arial;color:#667984">'+esc(p.journal||'Indexed research record')+'</div>'+
 '<a style="font:700 11px Arial;color:#00858c" href="'+esc(p.url)+'">ORIGINAL SOURCE →</a></div>';
 const cols=(items)=>items.map((p,i)=>'<td valign="top" width="'+Math.floor(100/Math.max(1,items.length))+'%" style="padding:8px;vertical-align:top">'+cell(p,'tech','tech-'+i)+'</td>').join('');
 const research=[...pubs,...materials].slice(0,3);
 const oppCard=(kind,label,items)=>items.length?'<td width="33%" valign="top" style="padding:8px"><div style="background:#f0f7f8;border-radius:9px;padding:14px"><h3 style="font:700 15px Arial;color:#0c3048">'+esc(label)+'</h3>'+items.map(o=>'<p style="font:12px/1.5 Arial"><a href="'+esc(o.url)+'">'+esc(o.title)+'</a></p>').join('')+'</div></td>':'';
 const oppCells=[oppCard('funding','RESEARCH GRANTS & FUNDING',opportunities.funding),oppCard('event','CONFERENCES & EVENTS',opportunities.event),oppCard('collaboration','COLLABORATION OPPORTUNITIES',opportunities.collaboration)].filter(Boolean).join('');
 const content='<tr><td style="padding:0 28px 24px">'+
 (tech.length?'<h2 style="font:800 23px Arial;color:#0b3047;margin:26px 0 10px">TECHNOLOGY <span style="color:#008d94">FRONTIERS</span></h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'+cols(tech)+'</tr></table>':'')+
 '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px"><tr>'+
 '<td width="50%" valign="top" style="padding:10px;border-top:2px solid #00858c"><h2 style="font:800 18px Arial;color:#0b3047">LATEST RESEARCH PUBLICATIONS</h2>'+research.map(p=>cell(p)).join('')+'</td>'+
 '<td width="50%" valign="top" style="padding:10px;border-top:2px solid #00858c"><h2 style="font:800 18px Arial;color:#0b3047">EMERGING RESEARCH TOPICS</h2>'+trends.map((t,i)=>'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #dce8eb;margin-bottom:12px"><tr><td width="92" valign="top" style="padding:7px 9px 10px 0">'+(imageFor('trend-'+i)?'<img src="'+esc(imageFor('trend-'+i).url)+'" alt="'+esc(imageFor('trend-'+i).alt)+'" width="88" style="display:block;width:88px;height:88px;object-fit:cover;border-radius:6px">':'')+'</td><td valign="top" style="padding:7px 0 10px"><div style="font:700 13px/1.3 Arial;color:#0b3047">0'+(i+1)+' · '+esc(t.title)+'</div><p style="font:12px/1.5 Arial;color:#4c6875;margin:5px 0">'+esc(t.description)+'</p><a style="font:700 11px Arial;color:#00858c" href="'+esc(t.support.url)+'">SUPPORTING PUBLICATION →</a></td></tr></table>').join('')+'</td></tr></table>'+
 (oppCells?'<table role="presentation" width="100%" style="margin-top:20px"><tr>'+oppCells+'</tr></table>':'')+
 '</td></tr>';
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BIRT Lab Research Digest · '+esc(date)+'</title></head><body style="margin:0;background:#eaf2f4;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:760px;background:#fff"><tr><td style="padding:24px 30px;border-top:5px solid #00858c"><table role="presentation" width="100%"><tr><td><strong style="font:900 28px Arial;color:#0b3047">BIRT<span style="color:#00858c">LAB</span></strong><div style="font:11px Arial;color:#536b74">Bioengineering &amp; Integrated<br>Regenerative Technologies Lab</div></td><td align="right"><strong style="font:900 21px Arial;color:#0b3047">RESEARCH <span style="color:#00858c">DIGEST</span></strong><div style="font:11px Arial;color:#536b74">WEEKLY TECHNOLOGY REVIEW · '+esc(date)+'</div></td></tr></table></td></tr>'+
 '<tr><td style="background:#07334d;color:#fff"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="52%" valign="middle" style="padding:27px"><div style="font:700 11px Arial;color:#9de5e5">FEATURE STORY</div><h1 style="font:800 26px/1.15 Arial;color:#fff">'+esc(lead.title)+'</h1><p style="font:13px Arial;color:#d7eef0">'+esc(lead.type)+' · '+esc(lead.date)+'</p><a style="display:inline-block;padding:12px;background:#fff;border-radius:22px;font:700 12px Arial;color:#007c83" href="'+esc(lead.url)+'">READ ORIGINAL RESEARCH →</a></td><td width="48%" valign="middle"><img src="'+esc(imageFor('hero').url)+'" alt="Illustrative image for the featured technology, not a figure from the publication" style="width:100%;max-height:300px;object-fit:cover;display:block"></td></tr></table></td></tr>'+
 content+
 '<tr><td style="background:#075365;padding:24px 30px;color:#fff;font:12px Arial">BIRT Lab Research Digest · <a style="color:#b9f1ef" href="https://birtlab.com/research-digest-latest.html">View online</a><p style="font:11px/1.5 Arial;color:#d7ebed">Research titles and bibliographic metadata are sourced from live indexes. Images are illustrative, not original study figures. To unsubscribe, email <a href="mailto:research@birtlab.com?subject=Unsubscribe%20from%20BIRT%20Lab%20Research%20Digest&body=Dear%20BIRT%20Lab%20Team%2C%0A%0APlease%20unsubscribe%20my%20email%20address%20from%20the%20BIRT%20Lab%20Research%20Digest%20mailing%20list.%0A%0AEmail%20address%3A%20%0A%0AThank%20you." style="color:#b9f1ef">research@birtlab.com</a> with a prepared unsubscribe request. Requests are processed manually.</p></td></tr></table></td></tr></table></body></html>';
}

async function main(){
 const now=new Date();const week=weekKey(now);const preview=process.env.BIRT_DIGEST_PREVIEW==='true';const history=readHistory();
 history.featured=history.featured||{};history.issues=history.issues||[];history.opportunities=history.opportunities||{};
 if(!preview&&history.issues.includes(week)&&!process.env.BIRT_DIGEST_FORCE_REBUILD){console.log('Issue already generated for week '+week);return}
 const seen=new Set(),titleSeen=new Set();
 const results=[];
 for(const t of topics){try{results.push(await search(t.query))}catch(err){console.error('Source unavailable for '+t.name+': '+err.message);results.push([])}}
 // Rotate the lead technology category by ISO week; other categories remain eligible.
 const rotation=Math.floor(now.getTime()/604800000)%topics.length;
 const ordered=results.map((items,i)=>items.filter(p=>{
  const k=keyOf(p),t=normalizeTitle(p.title);
  if(seen.has(k)||titleSeen.has(t)||history.featured[k]||history.titles?.[t])return false;
  seen.add(k);titleSeen.add(t);return true;
 }).sort((a,b)=>relevance(b,i)-relevance(a,i)).filter(p=>relevance(p,i)>=3).slice(0,topics[i].max+2));
 const lead=ordered[rotation].shift()||ordered.find(x=>x.length)?.shift();
 if(!lead)throw Error('No new source-verified publications; edition withheld.');
 const groups=ordered.map((items,i)=>items.slice(0,topics[i].max));
 if(groups.flat().length<2)throw Error('Insufficient new verified content; edition withheld.');
 const opportunities=freshOpportunities(history,now);
 const html=makeHtml({date:week,lead,groups,opportunities});
 if(preview){
  const previewDir=path.join(root,'research-digest-preview');
  fs.mkdirSync(previewDir,{recursive:true});
  fs.writeFileSync(path.join(previewDir,'issue-preview.html'),html);
  fs.writeFileSync(path.join(previewDir,'preview-report.json'),JSON.stringify({
   generatedAt:now.toISOString(),issueWeek:week,mode:'preview',lead:{title:lead.title,url:lead.url},
   categories:groups.map((items,i)=>({category:topics[i].name,count:items.length,articles:items.map(p=>({title:p.title,url:p.url}))})),
   opportunityCounts:Object.fromEntries(Object.entries(opportunities).map(([k,v])=>[k,v.length])),
   historicalIssuesUnchanged:true,emailSent:false
  },null,2)+'\n');
  console.log('PREVIEW generated with '+(1+groups.flat().length)+' publications. History and published editions unchanged. No emails sent.');
  return;
 }
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
