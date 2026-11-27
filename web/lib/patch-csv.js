import {fixtures} from "./show.js";
import {patchText} from "./patch.js";
import {fixtureFootage} from "./stage.js";

function quoteCell(value) {
 let text = String(value ?? "");
 if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
 return '"' + text.replaceAll('"','""') + '"';
}

export function patchCSV(show, routes) {
 const header = [
  "Fixture", "Area", "Type", "Box / output / address", "Quantity", "Pixel offset",
  "Status", "Previous patch", "Notes", "Modeled strand length (ft)", "Lead route (ft)",
  "Extra cord (ft)", "Total lead cord (ft)", "Lead route status"
 ];
 const rows = show.fixtures.map(f => [
  f.name, f.zone, fixtures[f.type], patchText(f,show), f.count, f.offset,
  f.state || "Planned", f.reference, f.notes, ...fixtureFootage(f,show,routes)
 ]);
 return "\uFEFF" + [header,...rows].map(row => row.map(quoteCell).join(",")).join("\r\n");
}
