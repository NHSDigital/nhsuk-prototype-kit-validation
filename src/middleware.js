const { formatErrors } = require("./format-errors");
const {
  validate,
  debugValidation,
  maskSensitiveValue,
  sanitiseObjectForDebug,
  scrubValidationOnlyFields,
} = require("./validators");

function createValidationMiddleware() {
  return function validationEngine(req, res, next) {
    if (req.method !== "POST") {
      // Flash-reader: pick up any errors stored by a previous redirect and expose them
      // to the template via res.locals so custom GET routes can supply their own data too.
      if (req.session && req.session._validationErrors) {
        const flash = req.session._validationErrors;
        delete req.session._validationErrors;
        res.locals.errors = flash.errors;
        res.locals.errorList = flash.errorList;
        debugValidation(req, "Restored validation errors from session flash", {
          errorKeys: flash.errors ? Object.keys(flash.errors) : [],
        });
      }
      debugValidation(req, "Skipping validation middleware for non-POST request", {
        method: req.method,
        path: req.path,
      });
      return next();
    }

    const validationInput = req.body._validationRules;

    if (!validationInput) {
      debugValidation(req, "Skipping validation because _validationRules is missing", {
        method: req.method,
        path: req.path,
        bodyKeys: Object.keys(req.body || {}),
      });
      return next();
    }

    debugValidation(req, "Validation request received", {
      method: req.method,
      path: req.path,
      bodyKeys: Object.keys(req.body || {}),
      validationFields: Object.keys(validationInput || {}),
      sessionKeys: Object.keys((req.session && req.session.data) || {}),
    });

    const constraints = {};

    // Create a detached object for validation — prevents corrupting session data before
    // the prototype kit's auto-store middleware runs.
    const dataToValidate = { ...req.session.data, ...req.body };

    for (const [field, rulesStr] of Object.entries(validationInput)) {
      try {
        constraints[field] = JSON.parse(rulesStr);

        debugValidation(req, `Parsed validation rules for field "${field}"`, {
          field,
          rules: constraints[field],
        });

        const hasPostedField = Object.prototype.hasOwnProperty.call(req.body, field);
        const hasPostedDateParts =
          Object.prototype.hasOwnProperty.call(req.body, `${field}-day`) ||
          Object.prototype.hasOwnProperty.call(req.body, `${field}-month`) ||
          Object.prototype.hasOwnProperty.call(req.body, `${field}-year`);

        debugValidation(req, `Posted field presence check for "${field}"`, {
          hasPostedField,
          hasPostedDateParts,
          postedValue: maskSensitiveValue(field, req.body[field]),
          sessionValue: maskSensitiveValue(field, req.session && req.session.data ? req.session.data[field] : undefined),
        });

        // If a field in this form was not posted at all, do not let stale session values bypass
        // presence validation.
        if (!hasPostedField && !hasPostedDateParts) {
          dataToValidate[field] = null;
          debugValidation(req, `Field "${field}" missing from request; normalised to null`);
        }

        // Handle checkbox/radio arrays with only '_unchecked' markers
        if (Array.isArray(dataToValidate[field])) {
          const checkedValues = dataToValidate[field].filter((val) => val !== "_unchecked");
          if (checkedValues.length === 0) {
            dataToValidate[field] = null;
            debugValidation(req, `Array field "${field}" contains only unchecked markers; normalised to null`, {
              originalArray: dataToValidate[field],
            });
          } else {
            dataToValidate[field] = checkedValues;
            debugValidation(req, `Array field "${field}" filtered to remove unchecked markers`, {
              originalArray: dataToValidate[field],
              filteredArray: checkedValues,
            });
          }
        }

        // Normalise date fields — support both nested objects and flat `-day/-month/-year` parts
        let day, month, year;
        if (dataToValidate[field] && typeof dataToValidate[field] === "object" && !Array.isArray(dataToValidate[field])) {
          day = dataToValidate[field].day;
          month = dataToValidate[field].month;
          year = dataToValidate[field].year;
        } else {
          day = dataToValidate[`${field}-day`];
          month = dataToValidate[`${field}-month`];
          year = dataToValidate[`${field}-year`];
        }

        if (day !== undefined || month !== undefined || year !== undefined) {
          // Flatten into the detached payload so date validators can find the parts
          dataToValidate[`${field}-day`] = day;
          dataToValidate[`${field}-month`] = month;
          dataToValidate[`${field}-year`] = year;

          const combined = `${day || ""}${month || ""}${year || ""}`.trim();

          // Mutate ONLY the detached payload so 'presence' triggers — req.session.data is untouched.
          dataToValidate[field] = combined === "" ? null : "date-present";

          debugValidation(req, `Date parts normalised for field "${field}"`, {
            day,
            month,
            year,
            combined,
            normalisedFieldValue: dataToValidate[field],
          });
        }
      } catch (e) {
        console.error(`Failed to parse validation rules for ${field}`);
        debugValidation(req, `Rule parse failed for field "${field}"`, {
          error: e && e.message ? e.message : e,
        });
      }
    }

    debugValidation(req, "Data prepared for validation", sanitiseObjectForDebug(dataToValidate));
    debugValidation(req, "Constraints prepared for validation", constraints);

    const validationErrors = validate(dataToValidate, constraints, { fullMessages: false });

    debugValidation(req, "Validation result", {
      hasErrors: Boolean(validationErrors),
      validationErrors,
    });

    if (validationErrors) {
      // VALIDATION FAILED — manually copy live inputs into session so the page can pre-fill failed values.
      // The core auto-store-data middleware never runs when we intercept here.
      const sessionBody = { ...req.body };
      scrubValidationOnlyFields(sessionBody);
      req.session.data = { ...req.session.data, ...sessionBody };

      if (req.session.data._validationRules) {
        delete req.session.data._validationRules;
      }
      if (req.session.data._validationDebug) {
        delete req.session.data._validationDebug;
      }

      scrubValidationOnlyFields(req.body);

      const formattedErrors = formatErrors(validationErrors);
      debugValidation(req, "Formatted validation errors", formattedErrors);

      req.session._validationErrors = {
        errors: formattedErrors.errors,
        errorList: formattedErrors.errorSummary,
      };
      const redirectTo = req.get("Referer") || req.path;
      debugValidation(req, "Redirecting back with flash errors", { redirectTo });
      return res.redirect(redirectTo);
    }

    // VALIDATION PASSED — clean up rules from session/body then hand off to next middleware.
    scrubValidationOnlyFields(req.session && req.session.data);
    scrubValidationOnlyFields(req.body);

    next();
  };
}

module.exports = { createValidationMiddleware };
