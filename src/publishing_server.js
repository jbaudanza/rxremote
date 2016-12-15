import express from 'express';
import jwt from 'jsonwebtoken';
import bodyParser from 'body-parser';


export default function PublishingServer(handlers, secret) {
  const router = express.Router();

  router.post('/events', bodyParser.json(), postEvent.bind(null, handlers));

  return router;
}


function postEvent(handlers, req, res, next) {
  const body = req.body;

  const errors = [];

  function required(obj, key) {
    if (!(key in obj)) {
      errors.push('Missing required attribute: ' + key)
      return false;
    }
  }

  function validate(obj, key, type) {
    if (!required(obj, key))
      return false;

    if (typeof obj[key] !== type) {
      errors.push(`Expected type of ${key} to be ${type}`)
      return false;
    }

    return true;
  }

  required(body, 'value');
  validate(body, 'sessionId', 'string');
  validate(body, 'key', 'string');

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
      actor = jwt.verify(token, secret);
    } catch(e) {
      res.status(403).json({error: 'Invalid token'});
      return;
    }
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
      ipAddress: req.ip.split(',')[0]
    };

    handlers[body.key](body.value, meta).then(function(response) {
      res.status(201).json(response);
    }, function(error) {
      if (error.retryAfter) {
        res.set('Retry-After', error.retryAfter)
          .status(429)
          .json({error: 'Too many requests', retryAfter: error.retryAfter});
      } else {
        next(error)
        console.error("Error raised during handler: " + body.key);
        console.error(error);
        respondWithError(500, "Internal Server Error")
      }
    });

  } else {
    respondWithError(404, 'Not found');
  }
}
