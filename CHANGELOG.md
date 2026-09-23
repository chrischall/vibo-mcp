# Changelog

## [2.2.3](https://github.com/chrischall/vibo-mcp/compare/v2.2.2...v2.2.3) (2026-09-23)


### Bug Fixes

* vibo auth/permission errors, rotated-token restarts, write-timeout hints and upload-path confinement ([#148](https://github.com/chrischall/vibo-mcp/issues/148)) ([6429c93](https://github.com/chrischall/vibo-mcp/commit/6429c93af63c5dfb619e1ec32a7a3f9b6c15737c))

## [2.2.2](https://github.com/chrischall/vibo-mcp/compare/v2.2.1...v2.2.2) (2026-09-23)


### Bug Fixes

* **deps:** bump dotenv from 17.4.2 to 18.0.1 ([#144](https://github.com/chrischall/vibo-mcp/issues/144)) ([b574ddc](https://github.com/chrischall/vibo-mcp/commit/b574ddc19c2b4ec0499a02769d1ad9734212a34a))
* **deps:** bump zod in the production-dependencies group ([#143](https://github.com/chrischall/vibo-mcp/issues/143)) ([3f1cb72](https://github.com/chrischall/vibo-mcp/commit/3f1cb728771a7aa4f3d42d28f2d5a19a5810bc18))
* **deps:** require zod ^4.6.5 to match @chrischall/mcp-utils 2.4.0 ([#147](https://github.com/chrischall/vibo-mcp/issues/147)) ([b1a7e64](https://github.com/chrischall/vibo-mcp/commit/b1a7e648e63f3d4880aa93ab9d2918ff45e56d21))
* **deps:** upgrade @chrischall/mcp-utils to 2.4.0 and @fetchproxy/* to 3.2.0 ([#146](https://github.com/chrischall/vibo-mcp/issues/146)) ([949f6c5](https://github.com/chrischall/vibo-mcp/commit/949f6c591fde9fa1db3dc3ea083c43dc8a0bf859))

## [2.2.1](https://github.com/chrischall/vibo-mcp/compare/v2.2.0...v2.2.1) (2026-09-21)


### Bug Fixes

* **tools:** say which writes are destructive ([#137](https://github.com/chrischall/vibo-mcp/issues/137)) ([a4fe026](https://github.com/chrischall/vibo-mcp/commit/a4fe026d9a1e53fac3e8b64665295a8663ce959e))

## [2.2.0](https://github.com/chrischall/vibo-mcp/compare/v2.1.0...v2.2.0) (2026-09-20)


### Features

* **client:** honour the caller's cancellation on Vibo requests ([#133](https://github.com/chrischall/vibo-mcp/issues/133)) ([b808295](https://github.com/chrischall/vibo-mcp/commit/b8082957146500f17db4f713b08fad731a4a0646))


### Refactor

* **client:** one signal helper for both request paths, and test the upload one ([#136](https://github.com/chrischall/vibo-mcp/issues/136)) ([7742f12](https://github.com/chrischall/vibo-mcp/commit/7742f125b545413dcf51b75797e478b7fc06978c)), closes [#134](https://github.com/chrischall/vibo-mcp/issues/134)

## [2.1.0](https://github.com/chrischall/vibo-mcp/compare/v2.0.0...v2.1.0) (2026-09-19)


### Features

* **deps:** take mcp-utils 1.0.0 so server/discover works ([#131](https://github.com/chrischall/vibo-mcp/issues/131)) ([74749d8](https://github.com/chrischall/vibo-mcp/commit/74749d861b9a7fdbce252b5271aaac8ab04a7a1c))


### Bug Fixes

* **deps:** raise the manifest node floor to match mcp-utils 1.0.0 ([#132](https://github.com/chrischall/vibo-mcp/issues/132)) ([d3b939f](https://github.com/chrischall/vibo-mcp/commit/d3b939f6bb2c8fd228d628292304c468a1712015))


### Performance

* **bundle:** drop the zod/v4 alias that doubled dist/bundle.js ([#129](https://github.com/chrischall/vibo-mcp/issues/129)) ([a95e42b](https://github.com/chrischall/vibo-mcp/commit/a95e42b3a81e4c4fe6049e226ce1a7aefa57368a)), closes [#127](https://github.com/chrischall/vibo-mcp/issues/127)

## [2.0.0](https://github.com/chrischall/vibo-mcp/compare/v1.8.2...v2.0.0) (2026-09-19)


### ⚠ BREAKING CHANGES

* **mcp:** migrate server to SDK v2 ([#126](https://github.com/chrischall/vibo-mcp/issues/126))

### Features

* **mcp:** migrate server to SDK v2 ([#126](https://github.com/chrischall/vibo-mcp/issues/126)) ([49a51d0](https://github.com/chrischall/vibo-mcp/commit/49a51d089236df297e3fdd3993f2506b59b09a25))

## [1.8.2](https://github.com/chrischall/vibo-mcp/compare/v1.8.1...v1.8.2) (2026-09-15)


### Bug Fixes

* **deps:** @fetchproxy/server 3.0.1 — capped peer frames, logged load drops, atomic identity writes ([#124](https://github.com/chrischall/vibo-mcp/issues/124)) ([f1e62a5](https://github.com/chrischall/vibo-mcp/commit/f1e62a59b5d7d7899a30aff1523d3cb3809c3855))
* **deps:** bump the production-dependencies group with 3 updates ([#122](https://github.com/chrischall/vibo-mcp/issues/122)) ([eb61a93](https://github.com/chrischall/vibo-mcp/commit/eb61a93028066dfe527e4f4172e25bea9dcea7b7))

## [1.8.1](https://github.com/chrischall/vibo-mcp/compare/v1.8.0...v1.8.1) (2026-09-10)


### Bug Fixes

* **deps:** @chrischall/mcp-utils 0.26.1 ([#118](https://github.com/chrischall/vibo-mcp/issues/118)) ([e4abf10](https://github.com/chrischall/vibo-mcp/commit/e4abf10bbe7dbb7006592dc0f834f3570be03487))
* **deps:** bump hono from 4.13.0 to 4.13.7 ([#116](https://github.com/chrischall/vibo-mcp/issues/116)) ([a735cb5](https://github.com/chrischall/vibo-mcp/commit/a735cb5b0305221d03edd37c48139a44e89e2a74))

## [1.8.0](https://github.com/chrischall/vibo-mcp/compare/v1.7.1...v1.8.0) (2026-09-07)


### Features

* **view:** the rung now reaches every read that asks Vibo for media ([#108](https://github.com/chrischall/vibo-mcp/issues/108)) ([49f0660](https://github.com/chrischall/vibo-mcp/commit/49f0660d0f6ca369973425e9a848cbff93c82378)), closes [#107](https://github.com/chrischall/vibo-mcp/issues/107)

## [1.7.1](https://github.com/chrischall/vibo-mcp/compare/v1.7.0...v1.7.1) (2026-09-04)


### Documentation

* **skill:** document the `view` response-shape parameter ([#105](https://github.com/chrischall/vibo-mcp/issues/105)) ([f0ecdb0](https://github.com/chrischall/vibo-mcp/commit/f0ecdb0c6eb656349d1da4eea53434f6fa6299d6))

## [1.7.0](https://github.com/chrischall/vibo-mcp/compare/v1.6.0...v1.7.0) (2026-09-04)


### Features

* **tools:** compact by default — strip media URLs, and minify every response ([#101](https://github.com/chrischall/vibo-mcp/issues/101)) ([bad36c2](https://github.com/chrischall/vibo-mcp/commit/bad36c2a39611b0cd05afe29ca8b0409dd312fbb))


### Bug Fixes

* **deps:** pick up @chrischall/mcp-utils 0.23.2 ([#104](https://github.com/chrischall/vibo-mcp/issues/104)) ([e3658bb](https://github.com/chrischall/vibo-mcp/commit/e3658bb9ab9263f414c2bd800156ee0d705a59ed))

## [1.6.0](https://github.com/chrischall/vibo-mcp/compare/v1.5.5...v1.6.0) (2026-08-29)


### Features

* **deps:** take @fetchproxy/server 2.2.0 so the concentrator can bind its sandbox address ([#87](https://github.com/chrischall/vibo-mcp/issues/87)) ([9d4b9c7](https://github.com/chrischall/vibo-mcp/commit/9d4b9c75e21b472076cdadf545a9988b06200aaa))

## [1.5.5](https://github.com/chrischall/vibo-mcp/compare/v1.5.4...v1.5.5) (2026-08-28)


### Bug Fixes

* **egress:** declare only the hosts the server process dials in mint.yaml ([#85](https://github.com/chrischall/vibo-mcp/issues/85)) ([1d76992](https://github.com/chrischall/vibo-mcp/commit/1d769926a4365b81cd2d63316266247375a1e1c9))

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
