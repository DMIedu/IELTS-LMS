/**
 * Reconciled from the user-supplied live Code.gs (7 October 2026).
 * Same LMSSync Key | Value | UpdatedAt schema, 45,000-character JSON chunks,
 * and legacy "data" support. Internal adapters only; public handle in Code.gs
 * authorizes every request. Never add the old unauthenticated public routes.
 */
const DMI_LMS_SYNC_CHUNK_SIZE = 45000;
const DMI_LMS_SYNC_MAX_CHARS = 2000000;

function readLiveLMSData_() {
  const values=tab('LMSSync').getDataRange().getValues();
  const chunks={}, legacy=[];
  for(let i=1;i<values.length;i++){
    const key=String(values[i][0]||''), match=key.match(/^chunk(\d+)$/);
    if(match){
      const index=Number(match[1]);
      if(!Number.isSafeInteger(index)||index<0||index>Math.ceil(DMI_LMS_SYNC_MAX_CHARS/DMI_LMS_SYNC_CHUNK_SIZE))
        securityError_('SYNC_CORRUPT','Invalid sync chunk index');
      if(Object.prototype.hasOwnProperty.call(chunks,index))
        securityError_('SYNC_CORRUPT','Duplicate sync chunks');
      chunks[index]=String(values[i][1]||'');
    }else if(key==='data')legacy.push(String(values[i][1]||'{}'));
  }
  const indexes=Object.keys(chunks).map(Number).sort((a,b)=>a-b);
  let payload;
  if(indexes.length){
    if(indexes.some((n,i)=>n!==i))
      securityError_('SYNC_CORRUPT','Sync chunks are incomplete; restore the backup before editing');
    payload=indexes.map(i=>chunks[i]).join('');
  }else if(legacy.length){
    if(legacy.length!==1)securityError_('SYNC_CORRUPT','Duplicate legacy sync snapshots');
    payload=legacy[0];
  }else return {};
  if(payload.length>DMI_LMS_SYNC_MAX_CHARS)
    securityError_('VALIDATION','Stored sync snapshot is too large');
  let data;
  try{data=JSON.parse(payload);}catch(e){securityError_('SYNC_CORRUPT','Stored sync data is not valid JSON');}
  if(!data || Array.isArray(data) || typeof data!=='object')
    securityError_('SYNC_CORRUPT','Stored sync snapshot must be an object');
  return data;
}

function writeLiveLMSData_(patch) {
  // Defense in depth for owner/editor calls as well as the public dispatch.
  Object.keys(patch).forEach(k=>{
    if(!sharedSyncKey_(k)||typeof patch[k]!=='string')
      securityError_('FORBIDDEN','Sync key not permitted');
  });
  // Public handle holds the script lock across read/merge/write.
  // Abort on unreadable old data; never overwrite a corrupt snapshot with {}.
  const merged=readLiveLMSData_();
  Object.keys(patch).forEach(k=>{merged[k]=patch[k];});
  const payload=JSON.stringify(merged);
  if(payload.length>DMI_LMS_SYNC_MAX_CHARS)
    securityError_('VALIDATION','Merged sync snapshot is too large');
  const sheet=tab('LMSSync'), range=sheet.getDataRange();
  const values=range.getValues(), formulas=range.getFormulas();
  const width=Math.max(3,values[0].length);
  const existing=values.slice(1).map((r,i)=>{
    const out=Array(width).fill('');
    for(let j=0;j<r.length;j++)out[j]=(formulas[i+1]&&formulas[i+1][j])||r[j];
    return out;
  });
  const slots=[];
  for(let i=1;i<values.length;i++){
    if(/^(?:chunk\d+|data)$/.test(String(values[i][0]||'')))slots.push(i-1);
  }
  const now=new Date(), chunks=[];
  for(let i=0;i<payload.length;i+=DMI_LMS_SYNC_CHUNK_SIZE)
    chunks.push(payload.slice(i,i+DMI_LMS_SYNC_CHUNK_SIZE));
  for(let i=0;i<Math.max(slots.length,chunks.length);i++){
    let pos=slots[i];
    if(pos==null){pos=existing.length;existing.push(Array(width).fill(''));}
    if(i<chunks.length){
      existing[pos][0]='chunk'+i;existing[pos][1]=chunks[i];existing[pos][2]=now;
    }else{
      // Clear only obsolete storage fields; retain additional columns.
      existing[pos][0]='';existing[pos][1]='';existing[pos][2]='';
    }
  }
  if(existing.length+1>sheet.getMaxRows())
    sheet.insertRowsAfter(sheet.getMaxRows(),existing.length+1-sheet.getMaxRows());
  // A single range write avoids the live code's destructive clear-then-write.
  // Headers, unrelated row positions/values/formulas, and all unpatched keys
  // are preserved. This still requires native Apps Script testing.
  sheet.getRange(2,1,existing.length,width).setValues(existing);
}
