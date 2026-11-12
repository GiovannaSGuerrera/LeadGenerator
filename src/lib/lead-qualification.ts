export const emptyWorkflow = {
  placeStatus: "unchecked" as const,
  websiteReview: "unchecked" as const,
  contactStatus: "new" as const,
  lastContactAt: "",
  nextActionAt: "",
  notes: ""
};

// A conservative screen for the default sales queue. A person can still inspect
// all source rows with the "include excluded" switch.
export const excludedNamePrefixes = [
  "ubs ", "ama ", "caps ", "cras ", "ceu ", "emef ", "emei ",
  "prefeitura ", "hospital municipal ", "escola municipal ",
  "unidade básica de saúde", "unidade basica de saude", "poupatempo ",
  "smart fit", "smartfit", "drogasil", "droga raia", "carrefour",
  "burger king", "mcdonald", "subway ", "o boticário", "renner ",
  "riachuelo ", "leroy merlin", "atacadão", "magazine luiza"
];

export const excludedCategories = [
  "shopping_mall", "shopping", "government", "government_office",
  "public_school", "city_hall", "notary_public", "youth_organization"
];

export function businessEligibilitySql(source: "overture" | "fsq", includeExcluded: boolean) {
  const localPhone = "(p.phone LIKE '+5511%' OR p.phone LIKE '11%' OR p.phone LIKE '(11)%')";
  const clauses = ["p.phone IS NOT NULL", "trim(p.phone) <> ''"];
  const values: string[] = [];
  if (!includeExcluded) {
    clauses.push(localPhone);
    clauses.push("coalesce(w.place_status, 'unchecked') <> 'not_found'");
    clauses.push("coalesce(w.website_review, 'unchecked') <> 'has_site'");
    clauses.push("coalesce(w.contact_status, 'new') NOT IN ('won', 'lost')");
    clauses.push(`(${excludedNamePrefixes.map(() => "lower(p.name) NOT LIKE ?").join(" AND ")})`);
    values.push(...excludedNamePrefixes.map((prefix) => `${prefix}%`));
    if (source === "overture") {
      clauses.push(`p.category NOT IN (${excludedCategories.map(() => "?").join(", ")})`);
      values.push(...excludedCategories);
    }
  }
  return { clause: clauses.join(" AND "), values };
}

export const prioritySql = `(
  CASE WHEN w.contact_status IN ('won', 'lost') THEN -100 ELSE 0 END +
  CASE WHEN w.website_review = 'no_site' THEN 50 ELSE 0 END +
  CASE WHEN w.place_status = 'confirmed' THEN 30 ELSE 0 END +
  CASE WHEN p.address IS NOT NULL AND trim(p.address) <> '' THEN 10 ELSE 0 END +
  CASE WHEN p.phone LIKE '+5511%' OR p.phone LIKE '11%' OR p.phone LIKE '(11)%' THEN 10 ELSE 0 END
)`;
