// No account details or credentials travel through this public HTTPS callback.
Deno.serve((req: Request) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const result = new URL(req.url).searchParams.get('result') === 'refresh' ? 'refresh' : 'return';
  return new Response(null, { status: 302, headers: {
    Location: `cerviced://stripe-connect?result=${result}`,
    'Cache-Control': 'no-store',
  } });
});
