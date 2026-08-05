// Fake supabase: chainable query builder returning canned provider rows.
const ROWS = [
  {id:'u1',slug:'lolas',display_name:"Lola's Studio",service_category:'NAILS',logo_url:null,location_text:'Soho',price:30},
  {id:'u2',slug:'nailbar',display_name:'The Nail Bar',service_category:'NAILS',logo_url:null,location_text:'Camden',price:45},
];
const builder = () => {
  const b = { data: ROWS, error: null };
  const chain = new Proxy(function(){}, {
    get: (_t, k) => {
      if (k === 'then') return (res) => Promise.resolve(b).then(res);
      return () => chain;
    },
    apply: () => chain,
  });
  return chain;
};
module.exports = new Proxy({}, {
  get: (_t, k) => {
    if (k === 'supabase') return { from: () => builder(), auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) }, rpc: () => builder() };
    return () => {};
  },
});
