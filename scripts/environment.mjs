// Keep existing development commands working after the product rename.
export const environment = (name) =>
  process.env[`VITERA_${name}`] ?? process.env[`CALPAL_${name}`];
