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
async function search(query){
 const params=new URLSearchParams({query:query+' AND FIRST_PDATE:[NOW-45DAYS TO NOW]',format:'json',pageSize:'30',sort:'FIRST_PDATE_D desc'});
 const res=await fetch('https://www.ebi.ac.uk/europepmc/webservices/rest/search?'+params,{signal:AbortSignal.timeout(25000)});
 if(!res.ok)throw Error('Europe PMC returned HTTP '+res.status);
 const data=await res.json();
 return (data.resultList?.result||[]).filter(p=>p.title&&p.id&&p.source&&p.firstPublicationDate).map(p=>({
   title:p.title.replace(/<[^>]+>/g,''),source:p.source,id:p.id,date:p.firstPublicationDate,
   journal:p.journalTitle||'',doi:p.doi||'',type:p.source==='PPR'?'PREPRINT · NOT PEER REVIEWED':'INDEXED PUBLICATION',
   url:'https://europepmc.org/article/'+encodeURIComponent(p.source)+'/'+encodeURIComponent(p.id)
 }));
}
function paper(p,featured=false){
 const photo=photoFor(p);return '<div style="padding:18px 0;border-bottom:1px solid #e5ecee">'+(featured?'<img src="'+esc(photo.url)+'" alt="Illustrative laboratory stock photograph; not an image from this paper" style="display:block;width:100%;height:auto;max-height:270px;object-fit:cover;margin:0 0 14px"><div style="font:11px Arial;color:#6a7d83">Illustrative photograph · '+esc(photo.credit)+'</div>':'')+
 '<div style="font:700 10px Arial;color:#087f82;letter-spacing:1.3px">'+esc(p.type)+' · '+esc(p.date)+'</div>'+
 '<h3 style="font:700 '+(featured?'23':'17')+'px/1.35 Arial;color:#0e2b46;margin:9px 0"><a style="color:#0e2b46;text-decoration:none" href="'+esc(p.url)+'">'+esc(p.title)+'</a></h3>'+
 '<p style="font:13px/1.6 Arial;color:#657984;margin:7px 0">'+esc(p.journal||'Europe PMC record')+(p.doi?' · DOI: '+esc(p.doi):'')+'</p>'+
 '<a style="font:700 12px Arial;color:#007f88" href="'+esc(p.url)+'">READ ORIGINAL PUBLICATION →</a></div>';
}
function section(kicker,title,inner){return '<tr><td style="padding:30px 32px;border-bottom:1px solid #e1e9ed"><div style="font:700 11px Arial;color:#07838a;letter-spacing:2px">'+esc(kicker)+'</div><h2 style="font:700 24px/1.2 Arial;color:#0e2b46;margin:12px 0 10px">'+esc(title)+'</h2>'+inner+'</td></tr>'}
function makeHtml({date,lead,groups}){
 const intro='<p style="font:15px/1.7 Arial;color:#536d79;margin:12px 0">A curated view of emerging bioengineering and regenerative technologies. Every publication links to its original indexed record; article titles and metadata are reproduced without AI-generated claims.</p>';
 const tech=groups[0].map(p=>paper(p)).join('');
 const research=groups[1].map(p=>paper(p)).join('');
 const materials=groups[2].map(p=>paper(p)).join('');
 const sections=[
 section('01 / FEATURE STORY','This week in regenerative technology',paper(lead,true)+intro),
 ...(tech?[section('02 / TECHNOLOGY FRONTIERS','Engineering the next generation',tech)]:[]),
 ...(research?[section('03 / LATEST RESEARCH','Selected scientific publications',research)]:[]),
 ...(materials?[section('04 / BIOMATERIALS','Materials and scaffold innovation',materials)]:[]),
 section('BIRT LAB / PROJECT SPOTLIGHT','OSTEOSERRA','<p style="font:15px/1.7 Arial;color:#536d79">Porous PLGA microsphere scaffold research concept. The prototype is research-stage; clinical performance is not established.</p><a style="color:#087f82;font-weight:bold" href="https://birtlab.com/osteoserra.html">EXPLORE THE PROJECT →</a>'),
 section('BIRT LAB / SCIENTIFIC COMMUNITY','ICIRM 2027','<p style="font:15px/1.7 Arial;color:#536d79">International Clinical Innovation &amp; Regenerative Medicine Conference · Kuala Lumpur · September 2027. Exact dates to be confirmed.</p><a style="color:#087f82;font-weight:bold" href="https://birtlab.com/icirm2027.html">CONFERENCE INFORMATION →</a>')
 ].join('');
 // Funding, events beyond verified BIRT Lab announcement, and collaboration calls are intentionally omitted.
 // They will appear only when an approved live source supplies a new verified opportunity.
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
 if(history.issues.includes(week)&&!process.env.BIRT_DIGEST_FORCE_REBUILD){console.log('Issue already generated for week '+week);return}
 const seen=new Set();const results=await Promise.all(topics.map(t=>search(t.query)));
 const groups=results.map((items,i)=>items.filter(p=>{const k=keyOf(p);if(seen.has(k)||history.featured[k])return false;seen.add(k);return true}).slice(0,topics[i].max));
 const lead=groups[0].shift()||groups[1].shift()||groups[2].shift();
 if(!lead||groups.flat().length<2)throw Error('Insufficient new source-verified content; refusing to publish.');
 const html=makeHtml({date:week,lead,groups});
 fs.mkdirSync(outDir,{recursive:true});fs.mkdirSync(path.dirname(historyPath),{recursive:true});
 fs.writeFileSync(path.join(outDir,week+'.html'),html);fs.writeFileSync(path.join(root,'research-digest-latest.html'),html);
 for(const p of [lead,...groups.flat()])history.featured[keyOf(p)]={date:week,title:p.title,url:p.url};
 history.issues.push(week);fs.writeFileSync(historyPath,JSON.stringify(history,null,2)+'\n');
 console.log('Generated issue '+week+' with '+(1+groups.flat().length)+' new source-linked publications. No emails sent.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
