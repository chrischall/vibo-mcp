// Single source of truth for the package version. release-please bumps the
// literal on the line carrying the release marker; every manifest and the MCP
// server banner import VERSION from here, so there is exactly one place to keep
// in sync (and one release-please extra-files entry).
export const VERSION = '1.1.0'; // x-release-please-version
