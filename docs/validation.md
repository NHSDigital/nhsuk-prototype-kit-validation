# Adding Form Validation

We have set up a custom validation engine in the prototype kit. It allows you to declare validation rules directly inside your Nunjucks views, right next to the inputs they apply to.

You don't need to write complex server routing to use this. When a user submits the form, the prototype automatically checks your rules. If the user's input fails validation, the kit automatically reloads the page and injects the correct NHS error styling and summary.

## Security note (important)

This validation approach is designed for prototype use.

`applyValidation()` writes rules into hidden inputs (`_validationRules[...]`) and those rules are posted back by the browser. Because these values come from the client, a user can remove or modify them before submission.

That means this mechanism is useful for UX validation behaviour in prototypes, but it must not be treated as trusted security validation in production.

## Validation debug logging (on/off)

Validation debug logging is disabled by default and only turns on when you explicitly enable one of these flags.

Enable globally (recommended for local debugging):

```bash
VALIDATION_DEBUG=true npm run start
```

Enable per request via query string:

```text
?validationDebug=true
```

Enable via form body:

```html
<input type="hidden" name="_validationDebug" value="true">
```

Enable for the whole session:

```javascript
req.session.data._validationDebug = true
```

Turn off:

* Remove/unset `VALIDATION_DEBUG`
* Remove `validationDebug` from the URL
* Remove `_validationDebug` from the form/session

Accepted truthy values are: `true`, `1`, `yes`, `on`.

## Step-by-step instructions

To add validation to any page, follow these 4 steps:

### 1. Update the page title
Make sure the browser `<title>` updates when there is an error to meet accessibility guidelines. Add an `if` statement to your `pageTitle` block:
`{% if errorList %}Error: {% endif %} Your page title`

### 2. Add the Error Summary
Add the NHS Error Summary component at the top of your `content` block. Wrap it in an `if` statement so it only appears when errors actually exist:
```html
{% if errorList %}
  {{ errorSummary({
    titleText: "There is a problem",
    errorList: errorList
  }) }}
{% endif %}

```

### 3. Connect your input to the error message

Inside your input component (like `input`, `radios`, etc.), add the `errorMessage` property and link it to the name of your field. For example, if your input name is `currentPassword`, you would add:
`errorMessage: errors.currentPassword`

### 4. Apply your validation rules

Place the `applyValidation()` macro directly beneath your input. Pass it the name of your field, and a list of rules you want to enforce.

---

## Full Example

Here is a complete, working example of a page with validation applied:

```html
{% extends 'layouts/settings.html' %}

{% block pageTitle %}
  {% if errorList %}Error: {% endif %}Enter
  your current password
{% endblock %}

{% block content %}
  <div class="nhsuk-grid-row">
    <div class="nhsuk-grid-column-two-thirds">
      {% if errorList %}
        {{
          errorSummary({
            titleText: "There is a problem",
            errorList: errorList
          })
        }}
      {% endif %}

      <span class="nhsuk-caption-l">Change password</span>
      <h1 class="nhsuk-heading-l">Enter your current password</h1>

      <form method="post">
        {{
          passwordInput({
              label: {
                text: "Current password"
              },
              id: "current-password",
              name: "currentPassword",
              errorMessage: errors.currentPassword
          })
        }}
        
        {{
          applyValidation('currentPassword', {
            presence: {
              allowEmpty: false,
              message: "Enter your current password"
            },
            length: {
              minimum: 2,
              message: "Password must be at least 2 characters" 
            }
          })
        }}

        {{
          button({
            text: "Continue"
          })
        }}
      </form>
      <a href="../login-details" class="nhsuk-link">I do not want to change my password</a>
    </div>
  </div>
{% endblock %}

```

---

## Writing validation rules

Rules are written in Nunjucks as a JavaScript-style object. Each key is a validator name, and its value holds that validator's options:

```njk
{{ applyValidation('nhsNumber', {
  presence: { allowEmpty: false, message: "Enter your NHS number" },
  format: { pattern: "[0-9 ]+", message: "NHS number must only include numbers" },
  digitLength: { is: 10, message: "NHS number must be 10 digits" }
}) }}
```

### Where rules go

* Put `applyValidation()` inside the `<form>`, usually straight after the input it checks. The hidden rules input has to be submitted with the form.
* The first argument must match the input's `name`. For date inputs, use the date input's `name` without `-day`, `-month` or `-year`.
* Use one `applyValidation()` per field. For inputs in a group, use `applyGroupValidation()` instead (see [Validating a group of inputs](#validating-a-group-of-inputs-for-example-a-phone-number)).
* Set the input's `id` to the kebab-case of its `name` (`nhsNumber` → `nhs-number`), so the error summary link goes to the input.

### How rules run

* **Rules run in the order you write them.** Each field shows only its **first** failing message, so put `presence` first, then format checks, then length or range checks.
* **Blank answers are still checked by most built-in rules.** A blank answer fails `format`, `length`, `email`, `numericality` and `url`. The custom rules (`digitLength`, `fileType`, `doesNotContain` and the date rules) skip blank answers.
  * Required field: put `presence` first, so the user sees "Enter…" rather than a format message.
  * Optional field: make the whole pattern optional, for example `pattern: "(\\d{1,3})?"`. A blank answer then passes, and anything entered is still checked.
* All posted values are text. `numericality` accepts text like `"12"`, unless you set `strict: true`.
* Checkbox answers are lists. `presence` fails if nothing is ticked, and `length: { minimum: 2 }` counts ticked options.

### Messages

* Always set `message`. Without it, users see validate.js defaults such as "is invalid".
* Avoid `%{value}` in messages. validate.js does put the user's answer in, but changes it first: it lowercases it and turns hyphens and underscores into spaces (`Bob-1` shows as "bob 1").
* A leading `^` is not needed. It is removed if you add one.
* One `message` covers every way a rule can fail. If you need different messages, use separate rules, for example `presence` for blank answers and `digitLength` for the wrong number of digits.

### Patterns (`format`)

* The **whole** answer must match the pattern. You don't need `^` or `$`.
* Write the pattern as a string and **double every backslash**: `"\\d"` becomes the regex `\d`. Nunjucks drops a single backslash, so `"\d"` matches the letter `d`.
* Add `flags: "i"` to ignore case.

| To allow | Pattern |
| --- | --- |
| Digits only | `"\\d+"` |
| Digits and spaces | `"[0-9 ]+"` |
| Exactly 6 digits | `"\\d{6}"` |
| Optional `+`, then 1 to 3 digits | `"\\+?\\d{1,3}"` |
| Letters, spaces, hyphens and apostrophes | `"[A-Za-z' \\-]+"` |
| Blank, or 1 to 3 digits (optional field) | `"(\\d{1,3})?"` |

### Built-in rules from validate.js

These come from [validate.js](https://validatejs.org/#validators). All of them accept `message`.

| Rule | Useful options | Example use |
| --- | --- | --- |
| `presence` | `allowEmpty: false` | Required fields |
| `length` | `minimum`, `maximum`, `is` | Characters in text, or ticked checkboxes |
| `format` | `pattern`, `flags` | Allowed characters |
| `numericality` | `onlyInteger`, `greaterThan`, `greaterThanOrEqualTo`, `lessThan`, `lessThanOrEqualTo`, `equalTo`, `strict` | Ages, quantities |
| `inclusion` | `within: [...]` | Answer must be one of a list |
| `exclusion` | `within: [...]` | Answer must not be one of a list |
| `equality` | `attribute: "<otherFieldName>"` | "Confirm password" matches `newPassword` |
| `email` | | Email addresses |
| `url` | | Web addresses |

validate.js's `date` and `datetime` rules are not set up and will cause an error. Use `isValidDate`, `isInPast`, `isInFuture` and `dateGuess` instead.

The custom rules added by this kit are listed in [Available Validation Rules](#available-validation-rules) below.

### Checking your rules

* If the page won't render after you add rules, check the rules object for a missing comma or bracket.
* Run the prototype with `VALIDATION_DEBUG=true` (see [Validation debug logging](#validation-debug-logging-onoff)). The terminal then shows the rules that were received, the values checked and each failing message.

---

## Available Validation Rules

You can combine different rules to make sure the user enters exactly what you need. Here are the core rules you can use inside the `applyValidation` macro:

### `presence`

Use this to make a field mandatory. It ensures the user doesn't leave the field completely blank or skip the question.

For `select`/dropdown fields, make sure the first (default) option has an empty `value` (for example `value: ""`). If the default option has a non-empty value, the field will be treated as filled in and can incorrectly pass validation.

* **`allowEmpty`** (true/false): Set this to `false` to ensure they actually type text (this prevents them from cheating the validation by just hitting the spacebar).
* **`message`**: The error text shown to the user if they leave it blank (e.g., "Enter your current password").

**Example:**

```javascript
presence: { 
  allowEmpty: false, 
  message: "Enter your current password" 
}

```

### `length`

Use this to enforce a character limit on text inputs. This is useful for things like passwords, National Insurance numbers, or reference codes.

* **`minimum`** (number): The minimum number of characters allowed.
* **`maximum`** (number): The maximum number of characters allowed.
* **`is`** (number): The exact number of characters required (useful for things like a 6-digit security code).
* **`message`**: The error text shown if the length is wrong (e.g., "Password must be at least 2 characters").

**Example:**

```javascript
length: { 
  minimum: 8, 
  maximum: 20,
  message: "Password must be between 8 and 20 characters" 
}
```

### `email`

Use this to validate email format.

* **`message`**: The error text shown when the email format is invalid.

**Example:**

```javascript
email: {
  message: "Enter an email address in the correct format, like name@example.com"
}
```

### `fileType`

Use this with file uploads to enforce allowed file extensions.

* **`allowed`** (array): List of allowed extensions, for example `['pdf', 'jpg', 'jpeg', 'png']`.
* **`message`**: The error text shown when the selected file extension is not allowed.

**Example:**

```javascript
fileType: {
  allowed: ["pdf", "jpg", "jpeg", "png"],
  message: "Choose a PDF, JPG or PNG file"
}
```

Note: This prototype only checks the submitted filename extension string, not the actual file contents or type.

### `doesNotContain`

Use this to block input that contains a specific substring — for example, to prevent test or placeholder values from being submitted.

* **`string`**: The substring that must not appear in the value.
* **`message`**: The error text shown when the substring is found.

**Example:**

```javascript
doesNotContain: {
  string: "test",
  message: "^Enter a real email address"
}
```

### `isValidDate`

Use this for the standard NHS 3-box date input (day, month, year). It checks that the user has filled in all three boxes and that the numbers form a real calendar date.

* **`message`**: The error text shown if the date is incomplete or invalid.

**Example:**

```javascript
isValidDate: { 
  message: "Enter a valid date of birth" 
}

```

`validDate` and `customDate` are still supported as aliases for backwards compatibility.

*(Note: If you want to force the user to enter a date, use this alongside the `presence` rule!)*

### `isInPast`

Use this with date inputs when the value must be before today.

* **`message`**: The error text shown if the date is today or in the future.

**Example:**

```javascript
isInPast: {
  message: "Date must be in the past"
}
```

### `isInFuture`

Use this with date inputs when the value must be after today.

* **`message`**: The error text shown if the date is today or in the past.

**Example:**

```javascript
isInFuture: {
  message: "Date must be in the future"
}
```

### `dateGuess`

Use this with date inputs when you need to compare the entered date to a specific target date and show different messages before/after that date.

* **`target`**: The date to compare against (for example `"2005-05-25"`).
* **`messageBefore`**: Error message when the entered date is before the target.
* **`messageAfter`**: Error message when the entered date is after the target.

**Example:**

```javascript
dateGuess: {
  target: "2005-05-25",
  messageBefore: "That date is too early",
  messageAfter: "That date is too late"
}
```

### `conditional`

Use this for inputs that are hidden inside a radio button or checkbox reveal (e.g., selecting "Email" reveals an input for "Email address"). It checks if the parent option was selected and ensures the revealed input isn't empty.

* **`dependentOn`**: An object containing the `name` (the ID/name of the parent radio group) and `value` (the specific option they selected).
* **`message`**: The error text shown if the revealed input is empty.

To validate conditional inputs properly, you usually need both:

* `presence` on the parent radios/checkboxes question (for example, "Select a contact method")
* `conditional` on each revealed child input (for example, "Enter your email address")

The `conditional` validator takes 3 options:

* `dependentOn.name` - the name of the parent radios/checkboxes field
* `dependentOn.value` - the option value that reveals this input
* `message` - the error message when the revealed input is empty

**Example:**

```javascript
conditional: {
  dependentOn: { 
    name: "contactMethod", 
    value: "email" 
  },
  message: "Enter your email address"
}
```

### Conditional inputs example pages

Use these example pages in the prototype:

* `/validation/conditional-radios`
* `/validation/conditional-checkboxes`

### `digitLength`

Use this like `length`, but it counts digits only. Spaces and other characters are ignored, which suits phone numbers like `07700 900 123`.

* **`minimum`**, **`maximum`**, **`is`** (number): the digit limits.
* **`message`**: the error text shown if the number of digits is wrong.

```javascript
digitLength: {
  minimum: 10,
  maximum: 11,
  message: "Enter a phone number with 10 or 11 digits"
}
```

## Validating a group of inputs (for example, a phone number)

Sometimes two or more inputs answer one question, for example a country code and a phone number. Use `applyGroupValidation()` so they share **one** error message and one error summary entry, as the date input does.

1. Import the macros in your layout: `{% from "macros/validation.njk" import applyValidation, applyGroupValidation %}`
2. Write the `<fieldset class="nhsuk-fieldset" role="group">` out in HTML, inside a `<div class="nhsuk-form-group">` that also gets `nhsuk-form-group--error` when `errors.<group>` exists.
3. Inside the fieldset, show one `errorMessage` with `errors.<group>.text`, and add its id to the fieldset's `aria-describedby`.
4. Give each input `errorMessage: errors.<group> and "<inputName>" in errors.<group>.invalidFields`. This highlights only the invalid inputs.
5. Add `applyGroupValidation('<group>', { <inputName>: { ...rules }, ... })` after the fieldset.

The error summary links to the first invalid input, so each input's `id` must be the kebab-case of its `name` (for example `phoneNumber` → `phone-number`).

See `/validation/input-group` for a complete working example, and the README for the full template.

If you want to reuse the group as your own macro (for example `phoneInput`), put it in a separate file such as `app/views/macros/phone-input.njk`. Running `npm install` overwrites `app/views/macros/validation.njk`.

### Persisting selected state for conditional options

When re-rendering a page after validation errors, keep the parent radio/checkbox option selected so the conditional input stays visible with its error message.

For checkboxes, define selected values once and reuse them in each item:

```nunjucks
{% set selectedUpdateMethods = data.updateMethod or [] %}
```

Then set each item's `checked` value using that variable:

```javascript
checked: "email" in selectedUpdateMethods
```

The `or []` fallback is important. It prevents template errors when no value has been posted yet and allows safe checks on first page load.

For radios, use the same idea with equality checks, for example:

```javascript
checked: data.contactMethod == "email"
```

## Current field coverage in this prototype

This is the current set of validation example fields and validators used in `app/views/validation`:

* `currentPassword`: `presence`, `length`, `inclusion`
* `newPassword`: `presence`, `length`
* `newPasswordConfirm`: `presence`
* `email`: `presence`, `email`
* `symptoms` (textarea): `presence`, `length`
* `country` (select): `presence`
* `contactMethod` (radios): `presence`
* `notificationPreferences` (checkboxes): `presence`
* `futureDate`: `presence`, `isValidDate`, `isInFuture`
* `pastDate`: `presence`, `isValidDate`, `isInPast`
* `leagueCupFinal`: `presence`, `isValidDate`, `dateGuess`
* `supportingDocument` (file upload): `presence`, `fileType`
* `contactMethod` (conditional radios parent): `presence`
* `contactEmail` (conditional radios reveal): `conditional`
* `contactPhone` (conditional radios reveal): `conditional`
* `updateMethod` (conditional checkboxes parent): `presence`
* `updateEmail` (conditional checkboxes reveal): `conditional`
* `updatePhone` (conditional checkboxes reveal): `conditional`
* `phone` group (`phoneCountryCode`, `phoneNumber`): `applyGroupValidation` with `format`, `presence`, `digitLength`

## Validators available

The validation engine supports:

* Validate.js built-in validators (for example `presence`, `length`, `email`, `type`, `inclusion`, `exclusion`, `format`, `numericality`, `equality`)
* Custom validators in this prototype: `conditional`, `isValidDate` (plus aliases `validDate` and `customDate`), `isInPast`, `isInFuture`, `dateGuess`, `fileType`, `doesNotContain`, `digitLength`