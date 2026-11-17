import { holidays as japan } from './japan.js';

const countries = { japan };

export function holidayCountries() { return Object.keys(countries); }

export function holidaysFor(country, year) {
  const source = countries[country];
  return source ? source(year) : {};
}
