const { converse } = require('./src/services/becca/engine');
const { BookingStatus } = require('./src/types/booking');
// Stub DB so we exercise conversation logic, not network.
const path = require.resolve('./src/services/databaseService');
require.cache[path] = { id:path, filename:path, loaded:true, exports:new Proxy({}, { get:(_t,k)=>{
  if(k==='getProviders') return async()=>[
    {id:'u1',slug:'lolas',display_name:"Lola's Studio",service_category:'NAILS',logo_url:null,location_text:'Soho'},
    {id:'u2',slug:'nailbar',display_name:'The Nail Bar',service_category:'NAILS',logo_url:null,location_text:'Camden'},
  ];
  if(k==='getProviderPriceRanges') return async()=>new Map([['u1',{min:30,max:65}],['u2',{min:25,max:80}]]);
  if(k==='searchProviders') return async()=>[];
  return async()=>[];
}})} as any;
const AS = require.resolve('./src/services/AvailabilityService');
require.cache[AS] = { id:AS, filename:AS, loaded:true, exports:{ AvailabilityService:{ findNextAvailableDate: async()=> '2026-08-08' } } } as any;

(async()=>{
  let ctx:any = undefined;
  for (const t of ["i need my nails done","what about saturday?","how much are they?","the first one"]) {
    const r = await converse({message:t,hat:'client',bookings:[],userId:'u1',conversation:ctx,now:new Date('2026-08-05T10:00:00')});
    ctx = r.context;
    console.log(`\nYOU:   ${t}`);
    console.log(`BECCA: ${r.message.content.split('\n')[0]}`);
    console.log(`       [carried: svc=${ctx.entities.service?.value.category ?? '-'} prov=${ctx.entities.provider?.label ?? '-'} shown=${ctx.lastProviders?.length ?? 0}]`);
  }
})();
