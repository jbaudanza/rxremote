import express from 'express';
import csurf from 'csurf';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';


export default function PublishingServer(handlers, secret) {
  const router = express.Router();

  router.use(function(req, res, next) {
    console.log(req.headers);
    next();
  })

  router.use(cookieParser(secret));
  router.use(csurf({cookie: true}));

  router.post('/events', postEvent.bind(null, handlers));
  router.get('/csrf', getCsrf);

  return router;
}


function getCsrf(req, res) {
  res.json({csrf: req.csrfToken()});
}


function postEvent(handlers, req, res, next) {
  const body = req.body;

  const errors = [];

  function validate(obj, key, type) {
    if (!(key in obj)) {
      errors.push('Missing required attribute: ' + key)
      return false;
    }

    if (typeof obj[key] !== type) {
      errors.push(`Expected type of ${key} to be ${type}`)
      return false;
    }

    return true;
  }

  function reserved(obj, key) {
    if (key in obj) {
      errors.push('Reserved attribute: ' + key)
      return false;
    } else {
      return true;
    }
  }

  validate(body, 'value', 'object');
  validate(body, 'sessionId', 'string');
  validate(body, 'key', 'string');

  if (errors.length === 0) {
    reserved(body.value, 'timestamp');
    reserved(body.value, 'actor');
  }

  if (errors.length > 0) {
    res.status(400).json({errors: errors});
    return;
  }

  const sessionId = body.sessionId;
  const name = body.name;

  const authorization = req.headers['authorization'];
  let actor;
  if (authorization) {
    const parts = authorization.split(' ');
    const authScheme = parts[0];
    const token = parts[1];
    if (authScheme.toUpperCase() != 'BEARER') {
      res.status(403).json({error: 'Unsupported authorization scheme'});
      return;
    }

    try {
      actor = jwt.verify(token, process.env['SECRET']);
    } catch(e) {
      res.status(403).json({error: 'Invalid token'});
      return;
    }
  }
  
  let limit;
  if (process.env['NODE_ENV'] === 'production') {
    limit = 5;
  } else {
    limit = 1000;
  }

  function respondWithError(code, text) {
    res.status(code).json({
      error: text,
      code: code
    });
  }

  if (handlers[body.key]) {
    const meta = {
      actor: actor,
      sessionId: sessionId,
      ipAddress: req.ip
    };

    handlers[body.key](body.value, meta).then(function(response) {
      res.status(201).json(response);
    }, function(error) {
      if (error.retryAfter) {
        res.set('Retry-After', error.retryAfter)
          .status(429)
          .json({error: 'Too many requests', retryAfter: error.retryAfter});
      } else {
        // TODO: Should we forward this to next() instead?
        console.error("Error raised during handler: " + body.key);
        console.error(error);
        respondWithError(500, "Internal Server Error")
      }
    });

  } else {
    respondWithError(404, 'Not found');
  }
}
