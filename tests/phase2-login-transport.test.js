// Run: node tests/phase2-login-transport.test.js
const fs = require('node:fs');
const path = require('node:path');
async function runTests(source) {
  function assert(condition,message){if(!condition)throw new Error(message);}
  class Params {
    constructor(values){this.values=Object.assign({},values);}
    get(key){return this.values[key]===undefined?null:String(this.values[key]);}
  }
  function client(replies){
    const values=new Map([['dmi_lms_token','saved-session']]), calls=[];
    const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
    const window={}, document={currentScript:{src:'https://example.test/dmi-auth.js'}};
    const fetch=async(url,options)=>{
      calls.push({url,options});
      const value=replies[calls.length-1];
      if(value instanceof Error)throw value;
      return {json:async()=>{if(value && value.parseError)throw value.parseError;return value;}};
    };
    new Function('window','document','localStorage','sessionStorage','fetch','URLSearchParams','location',source)(
      window,document,storage,storage,fetch,Params,{});
    return {auth:window.DMI_AUTH,calls,values};
  }
  let passed=0;
  const credentials={email:'test@example.invalid',password:'fictional-test-password'};
  const rejected={ok:false,code:'POST_REQUIRED',error:'Use POST'}, ok={ok:true};
  let c=client([rejected,ok]);
  assert((await c.auth.login(credentials)).ok && c.calls.length===2,'login retries explicit rejection');
  for(const call of c.calls){
    assert(call.options.method==='POST','retry must remain POST');
    assert(call.options.body.get('password')===credentials.password,'body preserved');
    assert(call.options.body.get('action')==='login','action preserved');
    assert(call.options.body.get('sessionToken')===null,'login excludes saved token');
    assert(!call.url.includes('password') && !call.url.includes(credentials.email),'no credentials in URL');
  }
  passed++;
  c=client([rejected,rejected,rejected]);
  assert((await c.auth.login(credentials)).code==='POST_REQUIRED' && c.calls.length===2,'retry bounded');passed++;
  for(const response of [
    {ok:false,error:'Invalid email or password'},
    {ok:false,code:'RATE_LIMITED',error:'Please try again in 15 minutes'},
    {ok:false,code:'SERVER_ERROR',error:'Request failed'},
    {ok:false,error:'Use POST'}]){
    c=client([response,ok]);
    assert(await c.auth.login(credentials)===response && c.calls.length===1,'no retry for '+(response.code||response.error));passed++;
  }
  for(const error of [new TypeError('Network failure'),new SyntaxError('Invalid JSON')]){
    c=client([error,ok]);let caught;
    try{await c.auth.login(credentials);}catch(e){caught=e;}
    assert(caught===error && c.calls.length===1,'ambiguous login failures not retried');passed++;
  }
  c=client([rejected,ok]);await c.auth.call('submitExamResult',{testName:'fictional'});
  assert(c.calls.length===1,'submission not retried');passed++;
  c=client([rejected,ok]);await c.auth.call('session');
  assert(c.calls.length===2 && c.calls[0].options.body.get('sessionToken')==='saved-session','session read retry retained');passed++;
  c=client([{parseError:new SyntaxError('bad')},ok]);await c.auth.call('listStudents');
  assert(c.calls.length===2,'JSON read retry retained');passed++;
  c=client([{ok:false,code:'UNAUTHENTICATED'}]);await c.auth.call('session');
  assert(!c.values.has('dmi_lms_token'),'invalid session cleared');passed++;
  c=client([rejected,rejected]);await c.auth.call('session');
  assert(c.values.has('dmi_lms_token'),'transient rejection preserves session');passed++;
  return passed;
}

runTests(fs.readFileSync(path.join(__dirname,'..','dmi-auth.js'),'utf8'))
  .then(count=>console.log(count+' login transport regression checks passed'))
  .catch(error=>{console.error(error.message);process.exitCode=1;});
