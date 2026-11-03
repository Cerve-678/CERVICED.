import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { clientRequestNote, PROVIDER_REQUEST_NOTE, REQUEST_RESPONSE_HOURS } from '../features/bookings/requestWindow';

const MIGRATIONS = join(__dirname, '../../supabase/migrations');

it('promises the same window the database enforces', () => {
  const definitions = readdirSync(MIGRATIONS)
    .sort()
    .map(file => readFileSync(join(MIGRATIONS, file), 'utf8'))
    .filter(sql => /CREATE OR REPLACE FUNCTION public\.process_expire_stale_pending_bookings/.test(sql));
  const newest = definitions[definitions.length - 1]!;
  expect(newest).toContain(`created_at < NOW() - INTERVAL '${REQUEST_RESPONSE_HOURS} hours'`);
});

it('tells both sides the number', () => {
  expect(clientRequestNote('Amy')).toContain('Amy has 24 hours');
  expect(PROVIDER_REQUEST_NOTE).toContain('24 hours');
});
