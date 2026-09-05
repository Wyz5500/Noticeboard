/** Verifies deterministic serialization for the tracked OpenAPI artifact. */
import { describe, expect, it } from 'vitest';

import { serializeOpenApiDocument } from '../../scripts/openapi-artifact.js';

describe('OpenAPI artifact serialization', () => {
  /** Sorts object keys recursively without changing contract-significant array order. */
  it('serializes documents deterministically', () => {
    expect(
      serializeOpenApiDocument({
        paths: {
          '/z': {
            get: { tags: ['z', 'a'], responses: { '404': {}, '200': {} } },
          },
          '/a': {},
        },
        openapi: '3.0.0',
      }),
    ).toBe(
      '{\n  "openapi": "3.0.0",\n  "paths": {\n    "/a": {},\n    "/z": {\n      "get": {\n        "responses": {\n          "200": {},\n          "404": {}\n        },\n        "tags": [\n          "z",\n          "a"\n        ]\n      }\n    }\n  }\n}\n',
    );
  });
});
