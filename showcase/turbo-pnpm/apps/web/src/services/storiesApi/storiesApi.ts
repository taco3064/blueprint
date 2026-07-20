import axios from 'axios';

// The axios instance this layer owns — blueprint bars any other layer from
// importing axios directly.
const client = axios.create({ baseURL: '/api' });

export function fetchStories(limit: number): { id: number; title: string }[] {
  client.defaults.params = { limit };
  return Array.from({ length: limit }, (_, id) => ({ id, title: `Story ${id}` }));
}
