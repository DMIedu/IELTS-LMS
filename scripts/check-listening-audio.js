/* Probe configured public audio URLs without downloading recordings.
 * npm installs and credentials are not needed. Run with Node.js:
 *   node scripts/check-listening-audio.js
 */
const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const root=path.join(__dirname,'..');
const urls=new Set();
for(const name of fs.readdirSync(root).filter(n=>/^book \d+ listening test \d+\.html$/.test(n))){
 const html=fs.readFileSync(path.join(root,name),'utf8');
 const block=html.match(/const PART_AUDIO_ONLINE = \{[\s\S]*?\};/)[0];
 for(const m of block.matchAll(/https:\/\/ieltstrainingonline\.com\/[^']+/g))urls.add(m[0]);
}
function probe(url,redirects=0){
 return new Promise(resolve=>{
  const request=https.get(url,{headers:{Range:'bytes=0-15','User-Agent':'DMI-listening-audio-check/1.0'}},response=>{
   const status=response.statusCode,type=response.headers['content-type']||'';
   if([301,302,303,307,308].includes(status)&&response.headers.location){
    response.destroy();
    if(redirects>=3){resolve({url,ok:false,error:'Too many redirects'});return;}
    const target=new URL(response.headers.location,url);
    if(target.protocol!=='https:'){resolve({url,ok:false,error:'Non-HTTPS redirect'});return;}
    probe(target.href,redirects+1).then(result=>resolve(Object.assign({},result,{url})));return;
   }
   // Status and type suffice; close before reading recording bytes.
   response.destroy();
   resolve({url,status,type,ok:[200,206].includes(status)&&/^(audio\/|video\/mp4|application\/octet-stream)/i.test(type)});
  });
  request.setTimeout(15000,()=>request.destroy(Error('Timed out')));
  request.on('error',error=>resolve({url,ok:false,error:error.message}));
 });
}
(async()=>{
 const list=Array.from(urls),results=[];
 for(let i=0;i<list.length;i+=4)results.push(...await Promise.all(list.slice(i,i+4).map(url=>probe(url))));
 fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
 fs.writeFileSync(path.join(root,'artifacts','listening-audio-report.json'),JSON.stringify(results,null,2)+'\n');
 results.forEach(r=>console.log((r.ok?'PASS':'FAIL')+' '+r.url+' '+(r.error||r.status+' '+r.type)));
 console.log(results.filter(r=>r.ok).length+'/'+results.length+' sources returned an audio-compatible response.');
 if(results.some(r=>!r.ok))process.exitCode=1;
})();
