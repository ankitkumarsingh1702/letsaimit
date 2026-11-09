import { useEffect, useId, useState } from "react";
import { filterPhoneCountries, PHONE_COUNTRIES } from "./registrationDraft.js";

export default function CountryCombobox({ value, onChange, onBlur, inputRef, error, id }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const selected = PHONE_COUNTRIES.find(country => country.code === value) || PHONE_COUNTRIES.find(country => country.code === "IN");
  const options = filterPhoneCountries(query);
  const activeIndex = Math.min(active, Math.max(0, options.length - 1));
  const optionId = index => `${listId}-${index}`;
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, listId]);

  function choose(country) {
    if (!country) return;
    onChange(country.code);
    setOpen(false);
    setQuery("");
  }
  function keyDown(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive(previous => Math.max(0, Math.min(options.length - 1, previous + (event.key === "ArrowDown" ? 1 : -1))));
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      choose(options[activeIndex]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false);
    } else if (event.key === "Tab") setOpen(false);
  }

  return <div className="registration-country">
    <input id={id} ref={inputRef} type="search" role="combobox" autoComplete="off"
      aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined}
      aria-activedescendant={open && options.length ? optionId(activeIndex) : undefined}
      aria-invalid={error ? true : undefined} aria-describedby={`${id}-hint ${id}-error`}
      value={open ? query : `${selected.flag} ${selected.name} (${selected.dialCode})`}
      onFocus={() => { setQuery(""); setActive(0); setOpen(true); }}
      onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }}
      onKeyDown={keyDown} onBlur={() => { setOpen(false); onBlur(); }} />
    <span className="fm-hint" id={`${id}-hint`}>Search by country or dial code.</span>
    {open && <ul id={listId} role="listbox" aria-label="Phone country" className="registration-countries">
      {options.map((country, index) => <li key={country.code} id={optionId(index)} role="option"
        aria-selected={country.code === value} data-active={index === activeIndex || undefined}
        onMouseDown={event => event.preventDefault()} onClick={() => choose(country)}>
        <span aria-hidden="true">{country.flag}</span> {country.name} <span>{country.dialCode}</span>
      </li>)}
      {!options.length && <li role="presentation">No matching country.</li>}
    </ul>}
  </div>;
}
