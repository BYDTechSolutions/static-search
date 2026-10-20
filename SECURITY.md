# Security policy

## Reporting a vulnerability

Please email **sales.bydtech@gmail.com** with the details, instead of opening a
public issue. We will acknowledge the report and keep you posted on the fix.

## Scope

The index is a public file: everything in it can be read by anyone who visits
your site. The build only indexes pages you publish, and skips pages marked
`noindex`, but it cannot tell a draft from a finished page. Check what is in the
folder before you build.

The element writes result text into the page with `textContent`, never as HTML,
and `highlight()` escapes the text it returns. A report that either can be made
to inject markup is in scope.
