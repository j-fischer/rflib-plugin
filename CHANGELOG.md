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



