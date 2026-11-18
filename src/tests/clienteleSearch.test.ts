import { searchClientele } from '../features/providers/clienteleSearch';

const clients = [
  { user_id: '1', customer_name: 'Amara Okafor' },
  { user_id: '2', customer_name: 'Bella Stone' },
  { user_id: '3', customer_name: 'Chloe Amari' },
];

describe('searchClientele', () => {
  it('returns everyone for an empty or blank search', () => {
    expect(searchClientele(clients, '')).toHaveLength(3);
    expect(searchClientele(clients, '   ')).toHaveLength(3);
  });

  it('matches anywhere in the name, ignoring capitals and outer spaces', () => {
    expect(searchClientele(clients, ' AMAR ').map(c => c.user_id)).toEqual(['1', '3']);
    expect(searchClientele(clients, 'stone').map(c => c.user_id)).toEqual(['2']);
  });

  it('returns nobody when no name matches', () => {
    expect(searchClientele(clients, 'zoe')).toEqual([]);
  });
});
