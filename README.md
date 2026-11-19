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
{% from "macros/validation.njk" import applyValidation, applyGroupValidation %}
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

### Writing rules

The [Writing validation rules](docs/validation.md#writing-validation-rules) guide covers rule order, messages, patterns and the built-in validate.js rules. The things that most often catch people out:

- **Rules run in order, and each field shows only its first failing message.** Put `presence` first.
- **A blank answer still fails `format`, `length`, `email`, `numericality` and `url`.** For an optional field, make the pattern optional, for example `"(\\d{1,3})?"`.
- **Double every backslash in patterns.** `"\\d"` becomes `\d`; `"\d"` becomes the letter `d`.
- **The whole answer must match a `format` pattern**, so you don't need `^` or `$`.
- **Always set `message`**, or users see validate.js defaults such as "is invalid".

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

### `digitLength`

Like `length`, but counts digits only. Spaces and other characters are ignored, so `07700 900 123` counts as 11. Useful for phone numbers and other formatted numbers. Supports `minimum`, `maximum` and `is`.

```js
digitLength: {
  minimum: 10,
  maximum: 11,
  message: "Enter a phone number with 10 or 11 digits"
}
```

Pair it with `format` (for example `pattern: "[0-9 ]+"`) to reject letters.

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

`presence`, `length`, `email`, `type`, `inclusion`, `exclusion`, `format`, `numericality`, `equality`, `url`

`date` and `datetime` are not set up and will cause an error. Use the date validators above.

---

## Validating a group of inputs

Use `applyGroupValidation()` when several inputs answer one question and should show **one** error, as a date input does. A phone number split into country code and number is an example.

Each input keeps its own name and rules. Errors are combined under the group key:

- `errors.<group>.text`: the message from the first invalid input (in the order the rules are listed)
- `errors.<group>.invalidFields`: the names of every invalid input, used to highlight them
- `errorList` gets one entry that links to the first invalid input (`phoneNumber` → `#phone-number`, so give each input an `id` that is the kebab-case of its name)

```njk
<div class="nhsuk-form-group {%- if errors.phone %} nhsuk-form-group--error{% endif %}">
  <fieldset class="nhsuk-fieldset" role="group" aria-describedby="phone-hint {%- if errors.phone %} phone-error{% endif %}">
    <legend class="nhsuk-fieldset__legend nhsuk-fieldset__legend--l">
      <h1 class="nhsuk-fieldset__heading">What is your phone number?</h1>
    </legend>

    <div class="nhsuk-hint" id="phone-hint">Include your country or dialling code. The code for the UK is +44.</div>

    {% if errors.phone %}
      {{ errorMessage({ id: "phone-error", text: errors.phone.text }) }}
    {% endif %}

    <div class="nhsuk-form-group--inline">
      {{ input({
        label: { text: "Country code", classes: "nhsuk-u-visually-hidden" },
        id: "phone-country-code",
        name: "phoneCountryCode",
        prefix: "+",
        value: data.phoneCountryCode,
        classes: "nhsuk-input--width-3",
        errorMessage: errors.phone and "phoneCountryCode" in errors.phone.invalidFields
      }) }}

      {{ input({
        label: { text: "Phone number", classes: "nhsuk-u-visually-hidden" },
        id: "phone-number",
        name: "phoneNumber",
        value: data.phoneNumber,
        classes: "nhsuk-input--width-10",
        errorMessage: errors.phone and "phoneNumber" in errors.phone.invalidFields
      }) }}
    </div>
  </fieldset>
</div>

{{ applyGroupValidation('phone', {
  phoneCountryCode: {
    presence: { allowEmpty: false, message: "Enter a country code, like +44" },
    format: { pattern: "\\+?\\d{1,3}", message: "Enter a country code, like +44" }
  },
  phoneNumber: {
    presence: { allowEmpty: false, message: "Enter a phone number" },
    format: { pattern: "[0-9 ]+", message: "Enter a phone number using numbers only" },
    digitLength: { minimum: 10, maximum: 11, message: "Enter a phone number with 10 or 11 digits" }
  }
}) }}
```

The fieldset is written out in HTML, so `errors.phone` goes straight into the markup. It's the same structure that `dateInput` renders internally:

- **`nhsuk-form-group--error` on a wrapper div.** Draws the red bar once for the whole group. It can't go on the `<fieldset>` itself: the `nhsuk-fieldset` class removes borders and padding, and without that class the browser's default fieldset border shows. The wrapper also removes the red bar each invalid input would otherwise draw.
- **`role="group"` and `aria-describedby` on the fieldset.** Screen readers announce the hint and error once for the whole group.
- **`errorMessage: true` on an input** (from `errors.phone and "<name>" in errors.phone.invalidFields`). Highlights only the invalid inputs, without adding another message.
- **`nhsuk-form-group--inline`** (from nhsuk-frontend). Puts the inputs side by side from tablet width up; they stack on mobile.

Notes:

- Don't also use `applyValidation()` on an input that is part of a group.
- Put `presence` first so a blank answer shows "Enter…" rather than a format message. The country code pattern allows an optional `+` because autofill can insert one, even though the prefix shows it.
- To reuse a group like this, wrap it in your own macro file (for example `app/views/macros/phone-input.njk`). Don't edit `macros/validation.njk`, because it is overwritten each time you run `npm install`.

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

The `examples/` directory contains 13 working form pages covering every built-in validator. Run the setup script to add them to your prototype under `app/views/validation/`:

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
| `input-group.html` | `applyGroupValidation`, `format`, `presence`, `digitLength` |

---

## License

MIT
