const WHATSAPP_URL = "https://wa.me/918868886074";
const PRIVACY_URL = "https://letsaimit.com/privacy-policy";

const FIELD_ORDER = ["schoolName", "contactName", "city", "phone", "needs"];
const LIMITS = {
  schoolName: 120,
  contactName: 80,
  city: 100,
  phone: 24,
  needs: 500,
};
const REQUIRED_MESSAGES = {
  schoolName: "Enter your school's name.",
  contactName: "Enter your name.",
  city: "Enter your city.",
  phone: "Enter a phone number.",
};

function cleanValues(values = {}) {
  return Object.fromEntries(
    FIELD_ORDER.map((name) => [
      name,
      typeof values?.[name] === "string" ? values[name].trim() : "",
    ]),
  );
}

export function validateSchoolEnquiry(values = {}) {
  const cleaned = cleanValues(values);
  const errors = {};

  for (const name of FIELD_ORDER) {
    const value = cleaned[name];
    if (!value && REQUIRED_MESSAGES[name]) {
      errors[name] = REQUIRED_MESSAGES[name];
    } else if (value.length > LIMITS[name]) {
      errors[name] = `Use ${LIMITS[name]} characters or fewer.`;
    }
  }

  if (cleaned.phone && !errors.phone) {
    const digits = cleaned.phone.replace(/\D/g, "");
    if (
      !/^\+?[0-9 ().-]+$/.test(cleaned.phone) ||
      digits.length < 8 ||
      digits.length > 15
    ) {
      errors.phone = "Enter a valid phone number.";
    }
  }

  return errors;
}

export function buildSchoolEnquiryUrl(values = {}) {
  const details = cleanValues(values);
  const message = [
    "Hi Dhiraj, I'd like to discuss school fitness consultancy with LetsAimIt.",
    `School: ${details.schoolName}`,
    `Contact: ${details.contactName}`,
    `City: ${details.city}`,
    `Phone: ${details.phone}`,
    ...(details.needs ? [`Our needs: ${details.needs}`] : []),
    "We would like guidance for our existing PE team.",
  ].join("\n");

  return `${WHATSAPP_URL}?text=${encodeURIComponent(message)}`;
}

export function createSchoolEnquiry(React, Arrow) {
  const h = React.createElement;

  return function SchoolEnquiry() {
    const [values, setValues] = React.useState({
      schoolName: "",
      contactName: "",
      city: "",
      phone: "",
      needs: "",
    });
    const [errors, setErrors] = React.useState({});
    const [handoffUrl, setHandoffUrl] = React.useState("");
    const fieldRefs = React.useRef({});

    function updateField(name, value) {
      const nextValues = { ...values, [name]: value };
      setValues(nextValues);
      setHandoffUrl("");
      if (errors[name]) {
        const nextError = validateSchoolEnquiry(nextValues)[name];
        setErrors((previous) => {
          const next = { ...previous };
          if (nextError) next[name] = nextError;
          else delete next[name];
          return next;
        });
      }
    }

    function submitEnquiry(event) {
      event.preventDefault();
      const nextErrors = validateSchoolEnquiry(values);
      setErrors(nextErrors);
      setHandoffUrl("");

      const invalidField = FIELD_ORDER.find((name) => nextErrors[name]);
      if (invalidField) {
        requestAnimationFrame(() => {
          const input = fieldRefs.current[invalidField];
          input?.focus({ preventScroll: true });
          input
            ?.closest(".sk-field")
            ?.scrollIntoView({ block: "center", behavior: "auto" });
        });
        return;
      }

      const url = buildSchoolEnquiryUrl(values);
      setHandoffUrl(url);
      // Opening WhatsApp prepares a message; the visitor still chooses to send it.
      try {
        window.open(url, "_blank", "noopener,noreferrer");
      } catch {
        // The visible link also works when opening a new window is unavailable.
      }
    }

    function field(name, label, options = {}) {
      const id = `school-${name}`;
      const errorId = `${id}-error`;
      const optional = name === "needs";
      const error = errors[name];
      const common = {
        id,
        name,
        value: values[name],
        maxLength: LIMITS[name],
        required: !optional,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? errorId : undefined,
        onChange: (event) => updateField(name, event.target.value),
        ref: (element) => {
          fieldRefs.current[name] = element;
        },
      };

      return h(
        "div",
        {
          className: `sk-field${optional ? " sk-field-wide" : ""}`,
          key: name,
        },
        h(
          "label",
          { htmlFor: id },
          label,
          optional
            ? h("span", { className: "sk-optional" }, " (optional)")
            : null,
        ),
        optional
          ? h("textarea", { ...common, rows: 3 })
          : h("input", { ...common, type: "text", ...options }),
        error ? h("p", { className: "sk-error", id: errorId }, error) : null,
      );
    }

    return h(
      "form",
      {
        className: "sk-form",
        noValidate: true,
        onSubmit: submitEnquiry,
        "aria-label": "School consultancy enquiry",
      },
      field("schoolName", "School name", { autoComplete: "organization" }),
      field("contactName", "Your name", { autoComplete: "name" }),
      field("city", "City", { autoComplete: "address-level2" }),
      field("phone", "Phone number", {
        type: "tel",
        inputMode: "tel",
        autoComplete: "tel",
      }),
      field("needs", "Your needs"),
      h(
        "div",
        { className: "sk-form-actions sk-field-wide" },
        h(
          "button",
          {
            className: "btn btn-lime sk-button sk-button-lime sk-submit",
            type: "submit",
          },
          "Continue in WhatsApp",
          Arrow ? h(Arrow) : null,
        ),
        h(
          "p",
          { className: "sk-form-note" },
          "Review your message before sending.",
        ),
        h(
          "a",
          {
            className: "sk-privacy",
            href: PRIVACY_URL,
            target: "_blank",
            rel: "noopener noreferrer",
          },
          "Privacy policy",
        ),
      ),
      handoffUrl
        ? h(
            "div",
            {
              className: "sk-handoff sk-field-wide",
              role: "status",
              "aria-live": "polite",
              "aria-atomic": true,
            },
            h("p", null, "Your message is ready. Send it in WhatsApp."),
            h(
              "a",
              {
                className: "sk-handoff-link text-link",
                href: handoffUrl,
                target: "_blank",
                rel: "noopener noreferrer",
              },
              "Open WhatsApp",
              Arrow ? h(Arrow) : null,
            ),
          )
        : null,
    );
  };
}
