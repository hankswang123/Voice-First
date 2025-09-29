// Global type declarations for style modules
// Allows importing `*.module.css` / `*.module.scss` in TypeScript without errors.

declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}

declare module '*.module.scss' {
  const classes: { [key: string]: string };
  export default classes;
}

declare module '*.css'; // (Optional) fallback for plain css imports
