# [0.16.0](https://github.com/j-fischer/rflib-plugin/compare/0.15.0...0.16.0) (2026-02-21)


### Features

* implement concurrency flag for parallel file processing ([#172](https://github.com/j-fischer/rflib-plugin/issues/172)) ([d54c72f](https://github.com/j-fischer/rflib-plugin/commit/d54c72f3e277d1db3b9b2dee938d6320bfe45b72))



# [0.15.0](https://github.com/j-fischer/rflib-plugin/compare/0.14.0...0.15.0) (2026-02-21)


### Features

* implement the --exclude flag for all `sf rflib logging commands` ([#171](https://github.com/j-fischer/rflib-plugin/issues/171)) ([bbd2dd6](https://github.com/j-fischer/rflib-plugin/commit/bbd2dd63e6c8eaa22730e9d31c276c4e78009e3f))



# [0.14.0](https://github.com/j-fischer/rflib-plugin/compare/0.13.3...0.14.0) (2026-02-21)


### Features

* add verbose flag for dryrun mode to logging instrument commands ([d6446f3](https://github.com/j-fischer/rflib-plugin/commit/d6446f348acfe8e702b531f3ccac216b92e8abbe))



## [0.13.3](https://github.com/j-fischer/rflib-plugin/compare/0.13.2...0.13.3) (2026-02-21)


### Bug Fixes

* **deps:** bump prettier from 3.7.4 to 3.8.1 ([#161](https://github.com/j-fischer/rflib-plugin/issues/161)) ([bfe8c36](https://github.com/j-fischer/rflib-plugin/commit/bfe8c36051d0de93042c7d7752f38e99c2b73219))



## [0.13.2](https://github.com/j-fischer/rflib-plugin/compare/0.13.1...0.13.2) (2026-02-21)


### Bug Fixes

* **deps:** bump @salesforce/core from 8.24.0 to 8.26.0 ([#168](https://github.com/j-fischer/rflib-plugin/issues/168)) ([02fc87d](https://github.com/j-fischer/rflib-plugin/commit/02fc87d6b6de9e754256f7fbfdff73d9c999287b))



## [0.13.1](https://github.com/j-fischer/rflib-plugin/compare/0.13.0...0.13.1) (2026-02-21)


### Bug Fixes

* **ci:** pin salesforcecli/github-workflows ([1a46c51](https://github.com/j-fischer/rflib-plugin/commit/1a46c51de5543f2558303d99d40b55e86c0ebc80))



# [0.13.0](https://github.com/j-fischer/rflib-plugin/compare/0.12.1...0.13.0) (2025-12-28)


### Features

* improve performance by processing files in parallel ([#152](https://github.com/j-fischer/rflib-plugin/issues/152)) ([bf64629](https://github.com/j-fischer/rflib-plugin/commit/bf64629aae1f42351c3e4cc65f1e53a07b5bdba8))



## [0.12.1](https://github.com/j-fischer/rflib-plugin/compare/0.12.0...0.12.1) (2025-12-28)


### Bug Fixes

* the System.debug replacements now handle variables that aren't string ([7366a5a](https://github.com/j-fischer/rflib-plugin/commit/7366a5abf0be4fe4c3a69233ccccb608a235fb4d))



# [0.12.0](https://github.com/j-fischer/rflib-plugin/compare/0.11.1...0.12.0) (2025-12-27)


### Features

* lower the minimum Node.js version requirement ([4cf915e](https://github.com/j-fischer/rflib-plugin/commit/4cf915e8101e41349bb1a32c12a60d8a81603c07))
* support System.debug LoggingLevel overload ([e1916fb](https://github.com/j-fischer/rflib-plugin/commit/e1916fb4b9b3b5bd0d6350e0bc7de401920842eb))
* update project setup to run on Node 24 ([#148](https://github.com/j-fischer/rflib-plugin/issues/148)) ([0db551f](https://github.com/j-fischer/rflib-plugin/commit/0db551f874ae25e895526fc65dd0859fb4768dec))



## [0.11.1](https://github.com/j-fischer/rflib-plugin/compare/0.11.0...0.11.1) (2025-12-14)


### Bug Fixes

* **deps:** bump prettier from 3.5.3 to 3.6.2 ([#140](https://github.com/j-fischer/rflib-plugin/issues/140)) ([3dfd44d](https://github.com/j-fischer/rflib-plugin/commit/3dfd44d6bd87dc9e33f2fe539ec7d904585ee028))



# [0.11.0](https://github.com/j-fischer/rflib-plugin/compare/0.10.1...0.11.0) (2025-12-14)


### Features

* add `wireit` as a dev dependency ([cb8b3b7](https://github.com/j-fischer/rflib-plugin/commit/cb8b3b7452534912b5b032a94f37eb7764812397))



## [0.10.1](https://github.com/j-fischer/rflib-plugin/compare/0.10.0...0.10.1) (2025-09-26)


### Bug Fixes

* prevented the flow instrumenter from leaving both a element and a startElementReference ([471b2c2](https://github.com/j-fischer/rflib-plugin/commit/471b2c2e07ba347882fa6d5361c12c4c29524c58))



# [0.10.0](https://github.com/j-fischer/rflib-plugin/compare/0.9.1...0.10.0) (2025-09-25)


### Features

* parallelize logging instrumentation ([#134](https://github.com/j-fischer/rflib-plugin/issues/134)) ([01636f9](https://github.com/j-fischer/rflib-plugin/commit/01636f9cfe517cf6cc90d666876dc536af1dc32e))



## [0.9.1](https://github.com/j-fischer/rflib-plugin/compare/0.9.0...0.9.1) (2025-05-24)


### Bug Fixes

* **deps:** bump @oclif/core from 4.2.10 to 4.3.0 ([#76](https://github.com/j-fischer/rflib-plugin/issues/76)) ([c601a5e](https://github.com/j-fischer/rflib-plugin/commit/c601a5eda920ece644c96c45505d17c306aa1522))



# [0.9.0](https://github.com/j-fischer/rflib-plugin/compare/0.8.1...0.9.0) (2025-04-19)


### Features

* Flow instrumentation now supports After Insert/Update triggered flows ([41c0790](https://github.com/j-fischer/rflib-plugin/commit/41c0790b48da25d5bb1b39332938d9ab8b8fe43c))



## [0.8.1](https://github.com/j-fischer/rflib-plugin/compare/0.8.0...0.8.1) (2025-04-13)


### Bug Fixes

* **deps:** bump @salesforce/sf-plugins-core from 12.1.4 to 12.2.1 ([#62](https://github.com/j-fischer/rflib-plugin/issues/62)) ([35e7d43](https://github.com/j-fischer/rflib-plugin/commit/35e7d4348b60f4d4ffe9faf943b01ce3fd9536e4))



# [0.8.0](https://github.com/j-fischer/rflib-plugin/compare/0.7.3...0.8.0) (2025-04-09)


### Features

* add logging instrumentation for Flow decision paths  ([a24bddc](https://github.com/j-fischer/rflib-plugin/commit/a24bddc56a89991c03b45b3cbbc1b04cf172b6de))



## [0.7.3](https://github.com/j-fischer/rflib-plugin/compare/0.7.2...0.7.3) (2025-04-07)


### Bug Fixes

* **deps:** bump @salesforce/core from 8.8.5 to 8.8.7 ([#55](https://github.com/j-fischer/rflib-plugin/issues/55)) ([3fbad05](https://github.com/j-fischer/rflib-plugin/commit/3fbad056db1158f5c8840782d229ba41dd32c46d))



## [0.7.2](https://github.com/j-fischer/rflib-plugin/compare/0.7.1...0.7.2) (2025-04-07)


### Bug Fixes

* **deps:** bump prettier-plugin-apex from 2.2.4 to 2.2.6 ([#59](https://github.com/j-fischer/rflib-plugin/issues/59)) ([5e121f5](https://github.com/j-fischer/rflib-plugin/commit/5e121f50c603f0dc55b58be200c09ed9e783410f))



## [0.7.1](https://github.com/j-fischer/rflib-plugin/compare/0.7.0...0.7.1) (2025-04-07)


### Bug Fixes

* **deps:** bump prettier from 3.4.2 to 3.5.3 ([#53](https://github.com/j-fischer/rflib-plugin/issues/53)) ([b49c9d0](https://github.com/j-fischer/rflib-plugin/commit/b49c9d09d9b82b86eb61e1b283adcb724857de42))



# [0.7.0](https://github.com/j-fischer/rflib-plugin/compare/0.6.4...0.7.0) (2025-03-18)


### Features

* **flow:** add Flow instrumentation with sample file and fix lint issues ([cd1c0b5](https://github.com/j-fischer/rflib-plugin/commit/cd1c0b5b834e9b6e2dc3b6641f4991ec8f47f551))



## [0.6.4](https://github.com/j-fischer/rflib-plugin/compare/0.6.3...0.6.4) (2025-03-17)


### Bug Fixes

* **deps:** bump @oclif/core from 4.2.7 to 4.2.10 ([#48](https://github.com/j-fischer/rflib-plugin/issues/48)) ([ae4bd6b](https://github.com/j-fischer/rflib-plugin/commit/ae4bd6bd80f8f26230045793033b6d3c645ee41e))



## [0.6.3](https://github.com/j-fischer/rflib-plugin/compare/0.6.2...0.6.3) (2025-02-17)


### Bug Fixes

* **deps:** bump prettier-plugin-apex from 2.2.2 to 2.2.4 ([#28](https://github.com/j-fischer/rflib-plugin/issues/28)) ([cbb674c](https://github.com/j-fischer/rflib-plugin/commit/cbb674c7af86f0918c444a20d6226325c6f30cd4))



## [0.6.2](https://github.com/j-fischer/rflib-plugin/compare/0.6.1...0.6.2) (2025-02-17)


### Bug Fixes

* **deps:** bump @oclif/core from 4.2.6 to 4.2.7 ([#35](https://github.com/j-fischer/rflib-plugin/issues/35)) ([545541e](https://github.com/j-fischer/rflib-plugin/commit/545541ef25bc09da2a109d22713801975cc243a5))



## [0.6.1](https://github.com/j-fischer/rflib-plugin/compare/0.6.0...0.6.1) (2025-02-17)


### Bug Fixes

* **deps:** bump @salesforce/sf-plugins-core from 12.1.2 to 12.1.4 ([#31](https://github.com/j-fischer/rflib-plugin/issues/31)) ([af66bde](https://github.com/j-fischer/rflib-plugin/commit/af66bded9f7ca7625b1ef89dc35dd82a6e9375ef))



# [0.6.0](https://github.com/j-fischer/rflib-plugin/compare/0.5.0...0.6.0) (2025-01-27)


### Features

* Add Console Log to RFLIB Logger Conversion for Aura and LWC ([#23](https://github.com/j-fischer/rflib-plugin/issues/23)) ([842a938](https://github.com/j-fischer/rflib-plugin/commit/842a938d9d18c85f39ee25ede2446b02343f526b))



# [0.5.0](https://github.com/j-fischer/rflib-plugin/compare/0.4.2...0.5.0) (2025-01-26)


### Features

* added functionality to replace Apex's System.debug statements with LOGGER.debug statements ([#22](https://github.com/j-fischer/rflib-plugin/issues/22)) ([52d1d95](https://github.com/j-fischer/rflib-plugin/commit/52d1d958bac312b22b050b2114a526dfdfaac896))



## [0.4.2](https://github.com/j-fischer/rflib-plugin/compare/0.4.1...0.4.2) (2025-01-26)


### Bug Fixes

* **deps:** bump @oclif/core from 4.2.3 to 4.2.4 ([c08afa0](https://github.com/j-fischer/rflib-plugin/commit/c08afa0a8ffa51bf8b8870beddb890c0de7ef0b6))



## [0.4.1](https://github.com/j-fischer/rflib-plugin/compare/0.4.0...0.4.1) (2025-01-26)


### Bug Fixes

* fixed various instrumentation issues with else blocks and promise chains ([a519271](https://github.com/j-fischer/rflib-plugin/commit/a5192718f408a8fea643b0d4fb33e83db564adfb))



# [0.4.0](https://github.com/j-fischer/rflib-plugin/compare/0.3.3...0.4.0) (2025-01-19)


### Features

* added --skip-instrumented flag for selective logging instrumentation ([4fd20bb](https://github.com/j-fischer/rflib-plugin/commit/4fd20bb31f5ed09edc5f2a6da6b80a6e9f2dc17e))



## [0.3.3](https://github.com/j-fischer/rflib-plugin/compare/0.3.2...0.3.3) (2025-01-19)


### Bug Fixes

* **deps:** bump @oclif/core from 4.2.2 to 4.2.3 ([a1cdb49](https://github.com/j-fischer/rflib-plugin/commit/a1cdb492066b024cb8b9f3ac95ae09677a67e011))



## [0.3.2](https://github.com/j-fischer/rflib-plugin/compare/0.3.1...0.3.2) (2025-01-19)


### Bug Fixes

* **deps:** bump @salesforce/core from 8.8.0 to 8.8.2 ([0a4b661](https://github.com/j-fischer/rflib-plugin/commit/0a4b66187e9a6f110745eae2f80bc1f78a5146de))



## [0.3.1](https://github.com/j-fischer/rflib-plugin/compare/0.3.0...0.3.1) (2025-01-12)


### Bug Fixes

* **deps:** bump @oclif/core from 4.2.0 to 4.2.2 ([147addd](https://github.com/j-fischer/rflib-plugin/commit/147addd8c283843b802de4f66952c3c029b5aac8))
* **deps:** bump @salesforce/sf-plugins-core from 12.1.1 to 12.1.2 ([66f01b8](https://github.com/j-fischer/rflib-plugin/commit/66f01b8269fe3505f0aa6539c9bca80f68bfe2fd))



# [0.3.0](https://github.com/j-fischer/rflib-plugin/compare/0.2.0...0.3.0) (2025-01-05)


### Features

* added --no-if flag that will skip the instrumentation of "if" and "else" blocks ([3f06d40](https://github.com/j-fischer/rflib-plugin/commit/3f06d40b291863dc153eb87ea6af18ee8f8085d4))



# [0.2.0](https://github.com/j-fischer/rflib-plugin/compare/0.1.2...0.2.0) (2025-01-01)


### Features

* added automated RFLIB logging instrumentation for Aura Components ([c93661f](https://github.com/j-fischer/rflib-plugin/commit/c93661fd398ffdc233db8c5dfdcd2c8d93a93922))



## [0.1.2](https://github.com/j-fischer/rflib-plugin/compare/0.1.1...0.1.2) (2024-12-30)


### Bug Fixes

* updated README to include lwc instrumentation command ([e2b05df](https://github.com/j-fischer/rflib-plugin/commit/e2b05df416a51edbec9312df2d2938e377b0c173))



## [0.1.1](https://github.com/j-fischer/rflib-plugin/compare/5af61ceb479c90a8ee129b9eddd4a594bf4c15a3...0.1.1) (2024-12-30)


### Bug Fixes

* **deps:** bump @oclif/core from 4.1.1 to 4.2.0 ([5af61ce](https://github.com/j-fischer/rflib-plugin/commit/5af61ceb479c90a8ee129b9eddd4a594bf4c15a3))


### Reverts

* Revert "build: updates configuration for ubuntu test runs" ([8809a23](https://github.com/j-fischer/rflib-plugin/commit/8809a2353e711bece922079634463763dbe4b919))



