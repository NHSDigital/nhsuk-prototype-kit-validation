const validate = require("validate.js");

const DEBUG_PREFIX = "[validation-debug]";
const VALIDATION_ONLY_FIELDS = ["_validationRules", "_validationDebug"];

function isTruthyDebugFlag(value) {
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;
  const normalised = value.trim().toLowerCase();
  return normalised === "1" || normalised === "true" || normalised === "yes" || normalised === "on";
}

function isValidationDebugEnabled(req) {
  const envEnabled = isTruthyDebugFlag(process.env.VALIDATION_DEBUG);
  const queryEnabled = req && req.query ? isTruthyDebugFlag(req.query.validationDebug) : false;
  const bodyEnabled = req && req.body ? isTruthyDebugFlag(req.body._validationDebug) : false;
  const sessionEnabled = req && req.session && req.session.data ? isTruthyDebugFlag(req.session.data._validationDebug) : false;
  return envEnabled || queryEnabled || bodyEnabled || sessionEnabled;
}

function maskSensitiveValue(key, value) {
  const keyName = `${key || ""}`.toLowerCase();
  const isSensitive =
    keyName.includes("password") ||
    keyName.includes("passcode") ||
    keyName.includes("secret") ||
    keyName.includes("token");
  if (isSensitive && value !== undefined && value !== null && `${value}` !== "") return "***";
  return value;
}

function sanitiseObjectForDebug(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const output = {};
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      output[key] = value.map((item) => maskSensitiveValue(key, item));
      continue;
    }
    output[key] = maskSensitiveValue(key, value);
  }
  return output;
}

function debugValidation(req, message, payload) {
  if (!isValidationDebugEnabled(req)) return;
  if (payload === undefined) {
    console.log(`${DEBUG_PREFIX} ${message}`);
    return;
  }
  console.log(`${DEBUG_PREFIX} ${message}`, payload);
}

function scrubValidationOnlyFields(target) {
  if (!target || typeof target !== "object") return;

  for (const field of VALIDATION_ONLY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(target, field)) {
      delete target[field];
    }
  }
}

// =============================================================================
// CUSTOM VALIDATORS
// =============================================================================

function getDateParts(attributes, key) {
  return {
    day: attributes[`${key}-day`],
    month: attributes[`${key}-month`],
    year: attributes[`${key}-year`],
  };
}

function parseNhsDate(day, month, year) {
  if (!day || !month || !year) return null;

  const dayStr = `${day}`.trim();
  const monthStr = `${month}`.trim();
  const yearStr = `${year}`.trim();
  const isNumericDate = /^\d+$/.test(dayStr) && /^\d+$/.test(monthStr) && /^\d+$/.test(yearStr);

  if (!isNumericDate) return null;
  if (!/^\d{4}$/.test(yearStr)) return null;

  const dayNum = Number(dayStr);
  const monthNum = Number(monthStr);
  const yearNum = Number(yearStr);

  if (!Number.isInteger(dayNum) || !Number.isInteger(monthNum) || !Number.isInteger(yearNum)) return null;
  if (monthNum < 1 || monthNum > 12) return null;

  const daysInMonth = new Date(Date.UTC(yearNum, monthNum, 0)).getUTCDate();
  if (dayNum < 1 || dayNum > daysInMonth) return null;

  return {
    dayStr,
    monthStr,
    yearStr,
    dayNum,
    monthNum,
    yearNum,
  };
}

// 1. Conditional Validator
validate.validators.conditional = function (value, options, key, attributes) {
  const dependentName = options.dependentOn.name;
  const dependentValue = options.dependentOn.value;
  const parentValue = attributes[dependentName];

  const isSelected = Array.isArray(parentValue) ? parentValue.includes(dependentValue) : parentValue === dependentValue;

  if (isSelected && validate.isEmpty(value)) {
    return options.message || "This field is required";
  }
  return null;
};

// 2. NHS Date Validator
function validateNhsDate(value, options, key, attributes) {
  const { day, month, year } = getDateParts(attributes, key);

  if (!day && !month && !year) return null;

  if (!day || !month || !year) {
    return options.message || "Enter a complete date";
  }

  const parsedDate = parseNhsDate(day, month, year);
  if (!parsedDate) {
    return options.message || "Enter a valid date";
  }

  return null;
}

validate.validators.isValidDate = validateNhsDate;
validate.validators.validDate = validateNhsDate;
validate.validators.customDate = validateNhsDate;

// 3. Date Is In Past Validator
validate.validators.isInPast = function (value, options, key, attributes) {
  const { day, month, year } = getDateParts(attributes, key);
  const parsedDate = parseNhsDate(day, month, year);

  if (!parsedDate) return null;

  const inputDateUtc = Date.UTC(parsedDate.yearNum, parsedDate.monthNum - 1, parsedDate.dayNum);
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  if (inputDateUtc >= todayUtc) {
    return options.message || "Date must be in the past";
  }

  return null;
};

// 4. Date Is In Future Validator
validate.validators.isInFuture = function (value, options, key, attributes) {
  const { day, month, year } = getDateParts(attributes, key);
  const parsedDate = parseNhsDate(day, month, year);

  if (!parsedDate) return null;

  const inputDateUtc = Date.UTC(parsedDate.yearNum, parsedDate.monthNum - 1, parsedDate.dayNum);
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  if (inputDateUtc <= todayUtc) {
    return options.message || "Date must be in the future";
  }

  return null;
};

// 5. Date Guess Validator
validate.validators.dateGuess = function (value, options, key, attributes) {
  const { day, month, year } = getDateParts(attributes, key);
  const target = options?.target;
  const messageBefore = options?.messageBefore ?? options?.messagebefore ?? options?.message?.before;
  const messageAfter = options?.messageAfter ?? options?.messageafter ?? options?.message?.after;
  const hasTarget = Boolean(target);
  const hasMessageBefore = messageBefore !== undefined && messageBefore !== null && `${messageBefore}`.trim() !== "";
  const hasMessageAfter = messageAfter !== undefined && messageAfter !== null && `${messageAfter}`.trim() !== "";

  if (!day || !month || !year) return null;

  const guessDate = new Date(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  if (isNaN(guessDate.getTime())) return null;

  if (hasTarget && (!hasMessageBefore || !hasMessageAfter)) {
    const optionKeys = options && typeof options === "object" ? Object.keys(options).join(", ") : "none";
    throw new Error(
      `Invalid dateGuess config for "${key}": when "target" is set, both "messageBefore" and "messageAfter" are required (received keys: ${optionKeys}).`,
    );
  }

  if (!hasTarget && (hasMessageBefore || hasMessageAfter)) {
    throw new Error(
      `Invalid dateGuess config for "${key}": "messageBefore" and "messageAfter" require a "target".`,
    );
  }

  if (!hasTarget) return null;

  const targetDate = new Date(target);

  if (guessDate < targetDate) {
    return `${messageBefore}`;
  }
  if (guessDate > targetDate) {
    return `${messageAfter}`;
  }
  return null;
};

// 6. Does Not Contain Validator
validate.validators.doesNotContain = function (value, options) {
  if (validate.isEmpty(value)) return null;

  const substringRaw =
    typeof options === "string"
      ? options
      : options && typeof options === "object"
        ? options.string
        : null;

  const substring = `${substringRaw || ""}`.trim();
  if (substring === "") return null;

  const valueStr = `${value}`.toLowerCase();
  const substringStr = substring.toLowerCase();

  if (valueStr.includes(substringStr)) {
    const message = options && typeof options === "object" ? options.message : null;
    return message || `Must not contain "${substring}"`;
  }

  return null;
};

// 7. File Type Validator (by extension only — does not check MIME type or file contents)
validate.validators.fileType = function (value, options) {
  if (validate.isEmpty(value)) return null;

  const valueToCheck = Array.isArray(value) ? value[0] : value;
  const rawName = `${valueToCheck || ""}`.trim();
  if (rawName === "") return null;

  // Browsers usually submit only the filename (often with a fake path), so we validate extension.
  const fileName = rawName.split(/[/\\]/).pop() || rawName;
  const fileExtension = (fileName.split(".").pop() || "").toLowerCase();

  const configuredExtensions =
    options && Array.isArray(options.allowed)
      ? options.allowed
      : options && Array.isArray(options.extensions)
        ? options.extensions
        : [];

  if (configuredExtensions.length === 0) return null;

  const allowedExtensions = configuredExtensions
    .map((entry) => `${entry}`.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);

  if (allowedExtensions.length === 0) return null;

  if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
    return options.message || `Choose a file in ${allowedExtensions.join(", ")} format`;
  }

  return null;
};

// 8. Digit Length Validator — counts digits only, so spaces and punctuation in
// formatted numbers (e.g. "07700 900 123") don't affect the length check.
validate.validators.digitLength = function (value, options) {
  if (validate.isEmpty(value)) return null;

  const digitCount = `${value}`.replace(/\D/g, "").length;
  const { is, minimum, maximum, message } = options || {};

  const tooShort = typeof minimum === "number" && digitCount < minimum;
  const tooLong = typeof maximum === "number" && digitCount > maximum;
  const wrongLength = typeof is === "number" && digitCount !== is;

  if (tooShort || tooLong || wrongLength) {
    if (message) return message;
    if (typeof is === "number") return `Must be ${is} digits`;
    if (typeof minimum === "number" && typeof maximum === "number") return `Must be between ${minimum} and ${maximum} digits`;
    if (typeof minimum === "number") return `Must be at least ${minimum} digits`;
    return `Must be ${maximum} digits or fewer`;
  }

  return null;
};

module.exports = {
  validate,
  DEBUG_PREFIX,
  VALIDATION_ONLY_FIELDS,
  isTruthyDebugFlag,
  isValidationDebugEnabled,
  maskSensitiveValue,
  sanitiseObjectForDebug,
  debugValidation,
  scrubValidationOnlyFields,
};
