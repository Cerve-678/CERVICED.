const path = require.resolve('./src/services/databaseService');
require.cache[path] = { id:path, filename:path, loaded:true, exports:new Proxy({}, { get:(_t,k)=>{
  if(k==='getProviders') return async()=>[{id:'u1',slug:'lolas',display_name:"Lola's Studio",service_category:'NAILS',logo_url:null,location_text:'Soho'}];
  if(k==='getProviderPriceRanges') return async()=>new Map([['u1',{min:30,max:65}]]);
  return async()=>[];
}})} as any;
const { CLIENT_CAPABILITIES } = require('./src/services/becca/capabilities/client');
const cap = CLIENT_CAPABILITIES.find((c:any)=>c.id==='discover.find');
(async()=>{
  try{
    const r = await cap.run({entities:{service:{kind:'service',value:{category:'NAILS'},confidence:0.9,sourceText:'nails',label:'nails'}},hat:'client',rawMessage:'nails',bookings:[],now:new Date()});
    console.log('OK:', r.text);
  }catch(e:any){ console.log('THREW:', e?.message); console.log(e?.stack?.split('\n').slice(0,4).join('\n')); }
})();
