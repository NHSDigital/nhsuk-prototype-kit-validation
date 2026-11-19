// Formats validate.js errors for NHS frontend components
function toKebabCase(value) {
  return `${value || ""}`
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

// `groups` maps a group key to its member fields, e.g. { phone: ["phoneCountryCode", "phoneNumber"] }.
// Errors on group members are collapsed into a single entry under the group key.
function formatErrors(validationErrors, groups = {}) {
  if (!validationErrors) return null;

  const errors = {};
  const errorSummary = [];

  const memberToGroup = {};
  for (const [group, members] of Object.entries(groups || {})) {
    for (const member of members) {
      memberToGroup[member] = group;
    }
  }

  // Loop through all failed fields
  for (const [field, messages] of Object.entries(validationErrors)) {
    // Take just the first error message for each field
    const errorMessage = messages[0];
    const group = memberToGroup[field];

    if (group) {
      if (errors[group]) {
        errors[group].invalidFields.push(field);
        continue;
      }

      // First invalid member supplies the message and is the summary link target
      errors[group] = {
        text: errorMessage,
        invalidFields: [field]
      };
      errorSummary.push({
        text: errorMessage,
        href: `#${toKebabCase(field)}`
      });
      continue;
    }

    // For the individual input component
    errors[field] = {
      text: errorMessage
    };

    // For the error summary at the top of the page
    errorSummary.push({
      text: errorMessage,
      href: `#${toKebabCase(field)}`
    });
  }

  return { errors, errorSummary };
}

module.exports = { formatErrors };
