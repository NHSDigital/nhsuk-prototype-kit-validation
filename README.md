# nhsuk-prototype-kit-validation

Validation engine for NHS prototype kit apps.

Define validation rules directly in your Nunjucks templates. No custom routes or server logic needed. When a form is submitted, the middleware checks the rules, and if validation fails it redirects back to the originating URL with the NHS error summary and inline error messages. Because it redirects rather than re-rendering directly, it works with any routing pattern — simple pages, custom GET routes, and dynamic URLs like `patients/1234/appointment` all work without any extra configuration.

---

## Install

### Step 1

Open a terminal window in your prototype folder and run:

```bash
npm install nhsuk-prototype-kit-validation
```

`npm install` automatically copies the macro to your project: `app/views/macros/validation.njk`

### Step 2

Add the following 2 lines to your `app/routes.js` 
**Note:** Must be before the line that contains: `module.exports = router`

```js
const { createValidationMiddleware } = require('nhsuk-prototype-kit-validation');

router.use(createValidationMiddleware());
```

### Step 3

Import the validation macro into your layout file, usually:
**`app/views/layouts.html`** 

```njk
{% from "macros/validation.njk" import applyValidation %}
```
This shares the macro with any page that uses the layout with:

```njk
{% extends 'layout.html' %}
```

---

## Optional: examples and docs

To add example pages and documentation to your prototype, run:

```bash
node node_modules/nhsuk-prototype-kit-validation/scripts/setup.js
```

This will prompt you:

```
Copy example validation pages to app/views/validation/? (y/N)
Copy validation docs to docs/validation.md? (y/N)
```

---

## Usage

Add `applyValidation()` directly beneath any input that needs validation. Pass it the field name and a rules object.

```njk
{% extends 'layouts.html' %}

{% block pageTitle %}
  {% if errorList %}Error: {% endif %}Enter your email
{% endblock %}

{% block content %}
  <div class="nhsuk-grid-row">
    <div class="nhsuk-grid-column-two-thirds">

      {% if errorList %}
        {{ errorSummary({ titleText: "There is a problem", errorList: errorList }) }}
      {% endif %}

      <h1 class="nhsuk-heading-l">Enter your email</h1>

      <form method="post">
        {{
          input({
            label: { text: "Email" },
            id: "email",
            name: "email",
            value: data['email'],
            errorMessage: errors.email
          })
        }}
        {{
          applyValidation('email', {
            presence: { allowEmpty: false, message: "Enter your email" },
            email: { message: "Enter an email address in the correct format, like name@example.com" }
          })
        }}
        {{ button({ text: "Continue" }) }}
      </form>

    </div>
  </div>
{% endblock %}
```

The `errorMessage: errors.<fieldName>` property wires the individual field error. `errorList` feeds the summary at the top of the page.

---

## Validator reference

### `presence`

Makes a field mandatory. Use `allowEmpty: false` to reject whitespace-only input.

```js
presence: {
  allowEmpty: false,
  message: "Enter your name"
}
```

> For `select`/dropdown fields, make sure the default option has an empty `value` (e.g. `value: ""`). A non-empty default value will be treated as a filled field and bypass presence validation.

---

### `email`

Validates email address format.

```js
email: {
  message: "Enter an email address in the correct format, like name@example.com"
}
```

---

### `length`

Enforces character limits.

```js
length: {
  minimum: 8,
  maximum: 20,
  message: "Password must be between 8 and 20 characters"
}
```

Use `is` for an exact length requirement:

```js
length: { is: 6, message: "Enter a 6-digit code" }
```

---

### `isValidDate`

Validates a standard NHS 3-box date input (day, month, year). Checks that all three boxes are filled and the combined date is a real calendar date.

```js
isValidDate: {
  message: "Enter a valid date of birth"
}
```

> `validDate` and `customDate` are supported as aliases for backwards compatibility.

Combine with `presence` to also catch empty date fields:

```js
presence: { message: "Enter your date of birth" },
isValidDate: { message: "Enter a valid date of birth" }
```

---

### `isInPast`

Validates that a date is before today.

```js
isInPast: {
  message: "Date must be in the past"
}
```

---

### `isInFuture`

Validates that a date is after today.

```js
isInFuture: {
  message: "Date must be in the future"
}
```

---

### `dateGuess`

Compares a date against a fixed target and returns a different message depending on whether the entry is before or after it.

```js
dateGuess: {
  target: "2005-05-25",
  messageBefore: "That date is too early",
  messageAfter: "That date is too late"
}
```

Both `messageBefore` and `messageAfter` are required when `target` is set.

---

### `fileType`

Validates a file upload field by checking the submitted filename extension. Does **not** inspect MIME type or file contents.

```js
fileType: {
  allowed: ["pdf", "jpg", "jpeg", "png"],
  message: "Choose a PDF, JPG or PNG file"
}
```

> **Important:** Because this checks the filename extension string only, a user could rename any file to bypass it. This is intentional and appropriate for prototypes. Do not rely on this for security in production.

---

{# TODO add doesNotContain #}

### `conditional`

Validates a conditionally revealed input (e.g., a text field that appears when a specific radio or checkbox is selected). The validator only triggers if the parent option is selected.

```js
conditional: {
  dependentOn: {
    name: "contactMethod",   // name of the parent radios/checkboxes field
    value: "email"           // the option value that reveals this input
  },
  message: "Enter your email address"
}
```

Typically used alongside `presence` on the parent field:

```js
// Parent radios
applyValidation('contactMethod', {
  presence: { message: "Select a contact method" }
})

// Revealed child input
applyValidation('contactEmail', {
  conditional: {
    dependentOn: { name: "contactMethod", value: "email" },
    message: "Enter your email address"
  }
})
```

#### Persisting conditional state across validation errors

When re-rendering after a validation failure, keep the parent option selected so the conditional input stays visible. For radios:

```njk
checked: data.contactMethod == "email"
```

For checkboxes:

```njk
{% set selectedMethods = data.updateMethod or [] %}
...
checked: "email" in selectedMethods
```

The `or []` fallback prevents template errors on first page load.

---

### Built-in validate.js validators

All [validate.js](https://validatejs.org/) built-in validators are also available:

`presence`, `length`, `email`, `type`, `inclusion`, `exclusion`, `format`, `numericality`, `equality`, `url`, `datetime`

---

## Debug logging

Validation debug logging is **off by default**. Enable it with any of these flags:

| Method | How |
|--------|-----|
| Environment variable | `VALIDATION_DEBUG=true npm start` |
| Query string | `?validationDebug=true` |
| Hidden form input | `<input type="hidden" name="_validationDebug" value="true">` |
| Session | `req.session.data._validationDebug = true` |

Accepted truthy values: `true`, `1`, `yes`, `on`.

When enabled, the middleware logs each step to the console: rule parsing, field normalisation, date part handling, the prepared data object (with sensitive values masked), and the final validation result.

---

## Security note

**This package is designed for prototype use only.**

`applyValidation()` writes validation rules into hidden form inputs (`_validationRules[...]`). Those values are posted back by the browser, which means a user can modify or remove them before submission.

This is fine for UX prototyping — it is not safe as a security boundary in production.

The middleware automatically strips `_validationRules` and `_validationDebug` from the session and request body before handing off to the NHS prototype kit's auto-store middleware.

---

## Example pages

The `examples/` directory contains 12 working form pages covering every built-in validator. Run the setup script to add them to your prototype under `app/views/validation/`:

| Page | Validators demonstrated |
|------|------------------------|
| `email.html` | `presence`, `email` |
| `textarea.html` | `presence`, `length` |
| `select.html` | `presence` |
| `radios.html` | `presence` |
| `checkboxes.html` | `presence` |
| `current-password.html` | `presence`, `length` |
| `new-password.html` | `presence`, `length` |
| `date-past-future.html` | `presence`, `isValidDate`, `isInPast`, `isInFuture` |
| `date-guess.html` | `presence`, `isValidDate`, `dateGuess` |
| `file-upload.html` | `presence`, `fileType` |
| `conditional-radios.html` | `presence`, `conditional` |
| `conditional-checkboxes.html` | `presence`, `conditional` |

---

## License

MIT
