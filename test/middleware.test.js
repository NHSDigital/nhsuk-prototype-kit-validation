"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createValidationMiddleware } = require("../src/middleware");

// ---------------------------------------------------------------------------
// Helpers: minimal mock req / res / next
// ---------------------------------------------------------------------------

function makeReq(overrides = {}) {
  const body = overrides.body
    ? JSON.parse(JSON.stringify(overrides.body))
    : {
        _validationRules: { email: JSON.stringify({ presence: { allowEmpty: false, message: "Enter your email" } }) },
        email: "",
      };
  return {
    method: overrides.method || "POST",
    path: "/email",
    query: {},
    get: (header) => (header === "Referer" ? overrides.referer || null : null),
    body,
    session: overrides.session ? JSON.parse(JSON.stringify(overrides.session)) : { data: {} },
  };
}

function makeRes() {
  const res = {
    locals: {},
    renderCalls: [],
    redirectCalls: [],
  };
  res.render = (view, locals) => res.renderCalls.push({ view, locals });
  res.redirect = (url) => res.redirectCalls.push(url);
  return res;
}

function makeNext() {
  let called = false;
  const fn = () => { called = true; };
  Object.defineProperty(fn, "called", { get: () => called });
  return fn;
}

// ---------------------------------------------------------------------------
// Shared validation bodies
// ---------------------------------------------------------------------------
const FAILING_BODY = {
  _validationRules: { email: JSON.stringify({ presence: { allowEmpty: false, message: "Enter your email" } }) },
  email: "",
};

const PASSING_BODY = {
  _validationRules: { email: JSON.stringify({ presence: { allowEmpty: false, message: "Enter your email" } }) },
  email: "user@example.com",
};

// ---------------------------------------------------------------------------
// POST — validation failure
// ---------------------------------------------------------------------------

describe("POST: validation failure", () => {
  it("redirects to Referer and stores flash errors", () => {
    const middleware = createValidationMiddleware();
    const req = makeReq({ body: FAILING_BODY, referer: "http://localhost/email" });
    const res = makeRes();
    const next = makeNext();

    middleware(req, res, next);

    assert.equal(res.redirectCalls.length, 1);
    assert.equal(res.redirectCalls[0], "http://localhost/email");
    assert.ok(req.session._validationErrors, "should store flash errors");
    assert.ok(req.session._validationErrors.errors, "should store errors object");
    assert.ok(Array.isArray(req.session._validationErrors.errorList), "should store errorList array");
    assert.equal(res.renderCalls.length, 0);
    assert.equal(next.called, false);
  });

  it("falls back to req.path when Referer header is absent", () => {
    const middleware = createValidationMiddleware();
    const req = makeReq({ body: FAILING_BODY, referer: null });
    const res = makeRes();

    middleware(req, res, makeNext());

    assert.equal(res.redirectCalls[0], "/email");
  });
});

// ---------------------------------------------------------------------------
// POST — validation passes / no rules
// ---------------------------------------------------------------------------

describe("POST: validation passes or no rules", () => {
  it("calls next() when validation passes", () => {
    const middleware = createValidationMiddleware();
    const req = makeReq({ body: PASSING_BODY });
    const res = makeRes();
    const next = makeNext();

    middleware(req, res, next);

    assert.equal(next.called, true);
    assert.equal(res.redirectCalls.length, 0);
    assert.equal(res.renderCalls.length, 0);
  });

  it("calls next() when _validationRules is missing", () => {
    const middleware = createValidationMiddleware();
    const req = makeReq({ body: { email: "" } });
    const res = makeRes();
    const next = makeNext();

    middleware(req, res, next);

    assert.equal(next.called, true);
    assert.equal(res.redirectCalls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// GET — flash reader
// ---------------------------------------------------------------------------

describe("GET: flash reader", () => {
  it("reads flash from session, populates res.locals, and clears session key", () => {
    const storedFlash = {
      errors: { email: { message: "Enter your email" } },
      errorList: [{ text: "Enter your email", href: "#email" }],
    };
    const middleware = createValidationMiddleware();
    const req = makeReq({
      method: "GET",
      session: { data: {}, _validationErrors: storedFlash },
    });
    const res = makeRes();
    const next = makeNext();

    middleware(req, res, next);

    assert.deepEqual(res.locals.errors, storedFlash.errors);
    assert.deepEqual(res.locals.errorList, storedFlash.errorList);
    assert.equal(req.session._validationErrors, undefined, "flash should be cleared after read");
    assert.equal(next.called, true);
  });

  it("calls next() cleanly on GET when no flash is present", () => {
    const middleware = createValidationMiddleware();
    const req = makeReq({ method: "GET", session: { data: {} } });
    const res = makeRes();
    const next = makeNext();

    middleware(req, res, next);

    assert.equal(next.called, true);
    assert.equal(res.locals.errors, undefined);
    assert.equal(res.locals.errorList, undefined);
  });
});

