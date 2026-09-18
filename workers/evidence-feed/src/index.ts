import { handleRequest, type Env } from './evidence-feed';

export default {
  fetch: (request: Request, env: Env) => handleRequest(request, env, {
    fetch: (input, init) => fetch(input, init),
    now: () => Date.now(),
  }),
};
