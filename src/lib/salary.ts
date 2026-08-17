import { QUALIFICATION_CONFIG } from "../config/qualification";

export function annualizeHourlySalary(hourlyAmount: number) {
  return Math.round(hourlyAmount * QUALIFICATION_CONFIG.annualHours);
}

export function convertToCad(amount: number, cadPerUnit: number) {
  return Math.round(amount * cadPerUnit);
}
