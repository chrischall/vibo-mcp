# Changelog

## [1.4.0](https://github.com/chrischall/vibo-mcp/compare/v1.3.2...v1.4.0) (2026-07-14)


### Features

* add hosted Cloudflare Worker connector (password accounts) ([#29](https://github.com/chrischall/vibo-mcp/issues/29)) ([c27ca4a](https://github.com/chrischall/vibo-mcp/commit/c27ca4a1922c6ccb841a686b489132a7f1ad6453))

## [1.3.2](https://github.com/chrischall/vibo-mcp/compare/v1.3.1...v1.3.2) (2026-07-14)


### Bug Fixes

* **plugin:** move SKILL.md into skills/ directory so plugin skills load ([#23](https://github.com/chrischall/vibo-mcp/issues/23)) ([5fef5f8](https://github.com/chrischall/vibo-mcp/commit/5fef5f8cce78154bb46faff67a888db2829faabd))

## [1.3.1](https://github.com/chrischall/vibo-mcp/compare/v1.3.0...v1.3.1) (2026-07-07)


### Bug Fixes

* bump @chrischall/mcp-utils to ^0.12.0 ([#19](https://github.com/chrischall/vibo-mcp/issues/19)) ([70f50e4](https://github.com/chrischall/vibo-mcp/commit/70f50e4ed3a0b4664355f43e3ad9c5b1cd3ad37f))


### Refactor

* adopt SessionStore from mcp-utils/session ([#17](https://github.com/chrischall/vibo-mcp/issues/17)) ([fcf1d01](https://github.com/chrischall/vibo-mcp/commit/fcf1d01d0a858db023f374a95650ef9021ecb616))


### Documentation

* document first-party dependency-bump label exception ([#22](https://github.com/chrischall/vibo-mcp/issues/22)) ([e002c1d](https://github.com/chrischall/vibo-mcp/commit/e002c1db61c46ce151abfac9a8b1ada956756d02))

## [1.3.0](https://github.com/chrischall/vibo-mcp/compare/v1.2.0...v1.3.0) (2026-06-16)


### Features

* SSO browser token auto-capture (fetchproxy) + docs polish ([#9](https://github.com/chrischall/vibo-mcp/issues/9)) ([7b061b5](https://github.com/chrischall/vibo-mcp/commit/7b061b5038e2cf0bc3a6b3d4603c33e1fd50b226))


### Bug Fixes

* persist captured Vibo session only after GET_ME verify ([#12](https://github.com/chrischall/vibo-mcp/issues/12)) ([976d194](https://github.com/chrischall/vibo-mcp/commit/976d194a634fc8205b5f3dc42aeff0ffcd148792)), closes [#10](https://github.com/chrischall/vibo-mcp/issues/10)
* use the real x-token/x-refresh-token localStorage keys for SSO capture ([#13](https://github.com/chrischall/vibo-mcp/issues/13)) ([a5a5f99](https://github.com/chrischall/vibo-mcp/commit/a5a5f99472e82620e80bb75a2596113320e32c4d))

## [1.2.0](https://github.com/chrischall/vibo-mcp/compare/v1.1.0...v1.2.0) (2026-06-16)


### Features

* v2/v3 tools — song management, comments, song ideas, imports, collaboration, section edits, uploads ([#5](https://github.com/chrischall/vibo-mcp/issues/5)) ([44a0e82](https://github.com/chrischall/vibo-mcp/commit/44a0e82fc9d4ef16de4794a785d4438535de5b42))

## [1.1.0](https://github.com/chrischall/vibo-mcp/compare/v1.0.0...v1.1.0) (2026-06-16)


### Features

* add section planning questions (list + answer) ([#2](https://github.com/chrischall/vibo-mcp/issues/2)) ([26839f5](https://github.com/chrischall/vibo-mcp/commit/26839f5adf5cb5404406609310de70571b191016))
* vibo-mcp — host/couple event music planning for Vibo (vibodj.com) ([bde0038](https://github.com/chrischall/vibo-mcp/commit/bde0038267c0cfef0479d20dec2e37406522f2f1))


### Bug Fixes

* tighten question-answer validation and cover the link path ([#4](https://github.com/chrischall/vibo-mcp/issues/4)) ([bd7c35c](https://github.com/chrischall/vibo-mcp/commit/bd7c35ceb1a0852fe90bf45daf8e854b929aa53e))
