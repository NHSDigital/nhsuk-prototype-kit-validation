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


// ---------------------------------------------------------------------------
// POST — grouped validation
// ---------------------------------------------------------------------------

const PHONE_GROUP_RULES = JSON.stringify({
  _group: {
    phoneCountryCode: {
      format: { pattern: "\\+\\d{1,3}", message: "Enter a country code, like +44" },
    },
    phoneNumber: {
      presence: { allowEmpty: false, message: "Enter a phone number" },
      format: { pattern: "[0-9 ]+", message: "Enter a phone number using numbers only" },
      digitLength: { minimum: 10, maximum: 11, message: "Phone number must be 10 or 11 digits" },
    },
  },
});

function runGroup(body) {
  const middleware = createValidationMiddleware();
  const req = makeReq({ body: { _validationRules: { phone: PHONE_GROUP_RULES }, ...body } });
  const next = makeNext();
  middleware(req, makeRes(), next);
  return { flash: req.session._validationErrors, next };
}

describe("POST: grouped validation", () => {
  it("collapses member errors into one group error and one summary entry", () => {
    const { flash } = runGroup({ phoneCountryCode: "+", phoneNumber: "abc" });

    assert.deepEqual(flash.errors, {
      phone: {
        text: "Enter a country code, like +44",
        invalidFields: ["phoneCountryCode", "phoneNumber"],
      },
    });
    assert.deepEqual(flash.errorList, [{ text: "Enter a country code, like +44", href: "#phone-country-code" }]);
  });

  it("links the summary to the first invalid member", () => {
    const { flash } = runGroup({ phoneCountryCode: "+44", phoneNumber: "" });

    assert.deepEqual(flash.errors.phone.invalidFields, ["phoneNumber"]);
    assert.deepEqual(flash.errorList, [{ text: "Enter a phone number", href: "#phone-number" }]);
  });

  it("fails presence for a member that was not posted, ignoring stale session data", () => {
    const middleware = createValidationMiddleware();
    const req = makeReq({
      body: { _validationRules: { phone: PHONE_GROUP_RULES }, phoneCountryCode: "+44" },
      session: { data: { phoneNumber: "07700900123" } },
    });
    middleware(req, makeRes(), makeNext());

    assert.equal(req.session._validationErrors.errors.phone.text, "Enter a phone number");
  });

  it("keeps non-group fields as separate errors in page order", () => {
    const middleware = createValidationMiddleware();
    const req = makeReq({
      body: {
        _validationRules: {
          email: JSON.stringify({ presence: { allowEmpty: false, message: "Enter your email" } }),
          phone: PHONE_GROUP_RULES,
        },
        email: "",
        phoneCountryCode: "+44",
        phoneNumber: "",
      },
    });
    middleware(req, makeRes(), makeNext());

    const { errors, errorList } = req.session._validationErrors;
    assert.deepEqual(errors.email, { text: "Enter your email" });
    assert.deepEqual(errorList.map((e) => e.href), ["#email", "#phone-number"]);
  });

  it("passes when every member is valid, counting only digits for digitLength", () => {
    const { flash, next } = runGroup({ phoneCountryCode: "+44", phoneNumber: "07700 900 123" });

    assert.equal(flash, undefined);
    assert.equal(next.called, true);
  });

  it("fails digitLength when there are too few digits", () => {
    const { flash } = runGroup({ phoneCountryCode: "+44", phoneNumber: "0770 090" });

    assert.equal(flash.errors.phone.text, "Phone number must be 10 or 11 digits");
  });
});
