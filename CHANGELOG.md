# Changelog

## [1.5.4](https://github.com/chrischall/vibo-mcp/compare/v1.5.3...v1.5.4) (2026-08-07)


### Refactor

* **connector:** retire the standalone Cloudflare Worker connector ([#70](https://github.com/chrischall/vibo-mcp/issues/70)) ([ccbf3ec](https://github.com/chrischall/vibo-mcp/commit/ccbf3ec8c33933713bc7c241b16cecf6c406c7ba))

## [1.5.3](https://github.com/chrischall/vibo-mcp/compare/v1.5.2...v1.5.3) (2026-08-06)


### Bug Fixes

* **deps:** move to @fetchproxy/server 2.0.0 for the v3 handshake ([#68](https://github.com/chrischall/vibo-mcp/issues/68)) ([65f9f33](https://github.com/chrischall/vibo-mcp/commit/65f9f33973c3927fbd98c866b2d46b96016e0749))

## [1.5.2](https://github.com/chrischall/vibo-mcp/compare/v1.5.1...v1.5.2) (2026-07-30)


### Bug Fixes

* **deps:** bump @fetchproxy/* to 1.7.0 and @chrischall/mcp-utils to 0.14.0 ([#60](https://github.com/chrischall/vibo-mcp/issues/60)) ([100001e](https://github.com/chrischall/vibo-mcp/commit/100001e95ea63f0a61771b12c2133d45a45e70e8))

## [1.5.1](https://github.com/chrischall/vibo-mcp/compare/v1.5.0...v1.5.1) (2026-07-27)


### Bug Fixes

* **deps:** lift @chrischall/mcp-connector to 1.1.1 ([#44](https://github.com/chrischall/vibo-mcp/issues/44)) ([7fe7938](https://github.com/chrischall/vibo-mcp/commit/7fe79385a280182379229680a43c019176ecfb69))
* **songs:** abstain on the SoundCloud check for short-named artists ([#51](https://github.com/chrischall/vibo-mcp/issues/51)) ([16861fb](https://github.com/chrischall/vibo-mcp/commit/16861fbeff52bab7342aa74d8d87041b9f3fc56e)), closes [#49](https://github.com/chrischall/vibo-mcp/issues/49)

## [1.5.0](https://github.com/chrischall/vibo-mcp/compare/v1.4.3...v1.5.0) (2026-07-27)


### Features

* **songs:** grade search results and steer callers to "&lt;Artist&gt; - &lt;Title&gt;" ([#48](https://github.com/chrischall/vibo-mcp/issues/48)) ([6be410c](https://github.com/chrischall/vibo-mcp/commit/6be410c8a914752c33a9a927c42e17ebc4a0a360))

## [1.4.3](https://github.com/chrischall/vibo-mcp/compare/v1.4.2...v1.4.3) (2026-07-20)


### Documentation

* correct the connector deploy runbook ([#39](https://github.com/chrischall/vibo-mcp/issues/39)) ([a369eee](https://github.com/chrischall/vibo-mcp/commit/a369eee332d2a98eb13a6277ad95d279ca9ddbea))

## [1.4.2](https://github.com/chrischall/vibo-mcp/compare/v1.4.1...v1.4.2) (2026-07-19)


### Bug Fixes

* **deps:** move to workers-oauth-provider 0.8.x and mcp-connector 1.0.0 ([#34](https://github.com/chrischall/vibo-mcp/issues/34)) ([6dbf025](https://github.com/chrischall/vibo-mcp/commit/6dbf025776d56fb3d829e36c737d6ede619c181b))

## [1.4.1](https://github.com/chrischall/vibo-mcp/compare/v1.4.0...v1.4.1) (2026-07-19)


### Bug Fixes

* **ci:** run the Workers test pool in CI ([#32](https://github.com/chrischall/vibo-mcp/issues/32)) ([c4c7dd1](https://github.com/chrischall/vibo-mcp/commit/c4c7dd1efc5dabb2add2c0de67b3f94de1f6b3b5))

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
