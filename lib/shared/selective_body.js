import * as querystring from 'node:querystring';

import raw from 'raw-body';

import * as attention from '../helpers/attention.js';
import { InvalidRequest } from '../helpers/errors.js';

let warned;

async function selectiveBody(cty, ctx, next) {
  if (ctx.is(cty)) {
    try {
      let usedFallback;
      const body = await (() => {
        if (ctx.req.readable) {
          return raw(ctx.req, {
            length: ctx.request.length,
            limit: '56kb',
            encoding: ctx.charset,
          });
        }
        // add code to be compatible with Nest configuration
        // https://docs.nestjs.com/faq/raw-body
        if (ctx.req.hasOwnProperty('rawBody')) {
          return ctx.req.rawBody;
        }
        if (!warned) {
          warned = true;
          /* eslint-disable no-multi-str */
          attention.warn('already parsed request body detected, having upstream middleware parser \
is not recommended, resolving to use req.body or request.body instead');
          /* eslint-enable */
        }
        usedFallback = true;
        return ctx.req.body || ctx.request.body;
      })();

      if (body instanceof Buffer || typeof body === 'string') {
        if (cty === 'application/json') {
          ctx.oidc.body = JSON.parse(body);
        } else {
          ctx.oidc.body = querystring.parse(body.toString());
        }
      } else if (usedFallback && cty === 'application/x-www-form-urlencoded') {
        // get rid of possible upstream parsers that parse querystring with objects, arrays, etc
        ctx.oidc.body = querystring.parse(querystring.stringify(body));
      } else {
        ctx.oidc.body = body;
      }
    } catch (err) {
      throw new InvalidRequest('failed to parse the request body');
    }

    await next();
  } else if (ctx.get('content-type')) {
    throw new InvalidRequest(`only ${cty} content-type bodies are supported on ${ctx.method} ${ctx.path}`);
  } else {
    ctx.oidc.body = {};
    await next();
  }
}

export default selectiveBody;
export const json = selectiveBody.bind(undefined, 'application/json');
export const urlencoded = selectiveBody.bind(undefined, 'application/x-www-form-urlencoded');
