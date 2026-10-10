/* Safe chart renderer. Only reviewed numeric data from the attempt API is accepted. */
(function(){
'use strict';
function render(host,c){
 if(!c)return;
 const valid=['bar','line'].includes(c.type)&&Array.isArray(c.categories)&&c.categories.length>0&&c.categories.length<=(c.type==='line'?16:6)&&Array.isArray(c.series)&&c.series.length>0&&c.series.length<=4&&Number.isFinite(c.maximum)&&c.maximum>0&&c.series.every(s=>Array.isArray(s.values)&&s.values.length===c.categories.length&&s.values.every(v=>Number.isFinite(v)&&v>=0&&v<=c.maximum));
 const projectionValid=c.type!=='line'||(c.categories.length>=2&&(c.projectionStartIndex==null||(Number.isInteger(c.projectionStartIndex)&&c.projectionStartIndex>=1&&c.projectionStartIndex<c.categories.length)));
 if(!valid||!projectionValid){const p=document.createElement('p');p.textContent='Chart unavailable. Ask your teacher.';host.append(p);return;}
 const figure=document.createElement('figure');figure.style.margin='16px 0';
 const title=document.createElement('h3');title.textContent=c.title;figure.append(title);
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
 function add(tag,attrs,text){const e=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,String(v)));if(text!=null)e.textContent=text;svg.append(e);return e;}
 svg.setAttribute('viewBox','0 0 840 430');svg.style.width='100%';svg.setAttribute('role','img');svg.setAttribute('aria-label',c.title+'; exact values follow in the table.');
 const colors=['#173a59','#bd202b','#a16b08','#168065'],left=68,top=75,height=270,width=744,bottom=345;
 c.series.forEach((s,i)=>{add('rect',{x:left+i*180,y:15,width:18,height:18,fill:colors[i]});add('text',{x:left+25+i*180,y:30,'font-size':16},s.name);});
 for(let i=0;i<=5;i++){const value=c.maximum*i/5,y=bottom-height*i/5;add('line',{x1:left,x2:left+width,y1:y,y2:y,stroke:'#d3dce4'});
 add('text',{x:left-10,y:y+5,'text-anchor':'end','font-size':15},Number(value.toFixed(2)));}
 if(c.type==='line'){
 const step=width/(c.categories.length-1);
 if(c.projectionStartIndex!=null){
 const x=left+step*c.projectionStartIndex;
 add('line',{x1:x,x2:x,y1:top,y2:bottom,stroke:'#586776','stroke-dasharray':'5 4','data-projection-boundary':c.projectionStartIndex});
 add('text',{x:Math.min(x+8,left+width-85),y:top-10,'font-size':14},'Projected →');
 }
 c.series.forEach((s,j)=>{
 add('polyline',{points:s.values.map((v,i)=>(left+step*i)+','+(bottom-v/c.maximum*height)).join(' '),fill:'none',stroke:colors[j],'stroke-width':3,'data-series':j});
 s.values.forEach((v,i)=>{const dot=add('circle',{cx:left+step*i,cy:bottom-v/c.maximum*height,r:3,fill:colors[j]});const t=document.createElementNS(ns,'title');t.textContent=c.categories[i]+' · '+s.name+': '+v+' '+c.unit;dot.append(t);});
 });
 c.categories.forEach((label,i)=>add('text',{x:left+step*i,y:373,'text-anchor':'middle','font-size':12},label));
 }else{
 const group=width/c.categories.length,bar=Math.min(35,group/(c.series.length+2));
 c.categories.forEach((name,i)=>{
 c.series.forEach((s,j)=>{const x=left+group*(i+.5)-bar*c.series.length/2+j*bar,h=s.values[i]/c.maximum*height;
 const rect=add('rect',{x,y:bottom-h,width:bar-3,height:h,fill:colors[j]});const t=document.createElementNS(ns,'title');t.textContent=name+' · '+s.name+': '+s.values[i]+' '+c.unit;rect.append(t);});
 const label=add('text',{x:left+group*(i+.5),y:373,'text-anchor':'middle','font-size':15},'');
 const words=String(name).split(' ');let line='',lines=[];for(const word of words){if((line+' '+word).trim().length>17&&line){lines.push(line);line=word;}else line=(line+' '+word).trim();}if(line)lines.push(line);
 lines.forEach((text,k)=>{const t=document.createElementNS(ns,'tspan');t.setAttribute('x',String(left+group*(i+.5)));t.setAttribute('dy',k?18:0);t.textContent=text;label.append(t);});
 });
 }
 add('text',{x:left,y:415,'font-size':15},c.unit);figure.append(svg);
 const wrap=document.createElement('div');wrap.style.overflowX='auto';const table=document.createElement('table');table.style.width='100%';
 const caption=document.createElement('caption');caption.textContent='Exact chart values ('+c.unit+')'+(c.type==='line'&&c.projectionStartIndex!=null?'; projected from '+c.categories[c.projectionStartIndex]:'');table.append(caption);
 const head=document.createElement('tr');['Category',...c.series.map(s=>s.name)].forEach(v=>{const th=document.createElement('th');th.scope='col';th.textContent=v;head.append(th);});table.append(head);
 c.categories.forEach((name,i)=>{const tr=document.createElement('tr'),th=document.createElement('th');th.scope='row';th.textContent=name;tr.append(th);
 c.series.forEach(s=>{const td=document.createElement('td');td.textContent=String(s.values[i]);tr.append(td);});table.append(tr);});
 wrap.append(table);figure.append(wrap);host.append(figure);
}
window.DMI_MOCK_CHART={render};
})();
