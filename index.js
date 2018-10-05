#!/usr/bin/env node

const IgersElementsFinder = require('./ig-elements-finder');

const {promisify} = require('util');
const fs = require('fs');
const puppeteer = require('puppeteer');
const meow = require('meow');
const ora = require('ora');
const writeYaml = require('write-yaml');
const writeFileAsync = promisify(fs.writeFile);
const writeYamlAsync = promisify(writeYaml);
const Logger = require('./logger')();

const spinner = Logger.spinner();

const cli = meow(
		`
	Usage
    	$ instagram-crawler <name>

	Options
		--output -o           define output format (JSON, YAML)
		--limit -l	  	      get only the number of post defined by the limit

	Examples
		$ instagram-crawler loicortola
		$ instagram-crawler loicortola -o yaml
		$ instagram-crawler loicortola -o yaml - l 10
`,
		{
			flags: {
				output: {
					type: 'string',
					alias: 'o'
				},
				limit: {
					type: 'string',
					alias: 'l'
				}
			}
		}
);

const IgCrawler = class {
	constructor({input, flags}) {
		// Variable
		this.targetUsername = input[0].trim();
		this.output = flags && flags.output ? flags.output : null;
		this.silent = this.output === "console";
		this.limit = flags && flags.limit ? parseInt(flags.limit) : null;
		if (this.limit === -1) {
			this.limit = null;
		}
		if (this.silent) {
			Logger.setSilent(true);
		}
		spinner.start('Crawler will start');
		if (this.targetUsername.length === 0) {
			throw new Error("You need to provide a specific username to crawl");
		}
	}

	async start() {
		// Retrieve elements
		spinner.succeed();
		spinner.info(`Will crawl target profile ${this.targetUsername}`);
		// Init browser
		await this._initBrowser();

		try {

			// Crawl structure from template
			await this._getSelectorsFromTemplate();

			// Crawl target profile
			await this._crawlProfile();

		} finally {
			await this.browser.close();
		}

		// Write to file
		await this._writeToFile();
		spinner.succeed('Dump to file successful');

	}

	async _crawlProfile() {
		try {
			// Create new page
			this.page = await this.browser.newPage();
			await this.page.setExtraHTTPHeaders({'Accept-Language': 'en-US'});

			// Get response
			let response = await this.page.goto(`https://instagram.com/${this.targetUsername}`, {
				waitUntil: ['networkidle0', 'domcontentloaded']
			});

			this._assertPageSuccess(response);

			// Create profile attribute
			this.profile = {};

			// Get profile and all post urls
			this.profile.profile = await this._getProfileInfo(this.page.url());
			let postUrls = await this._getPostsUrls(this.profile.profile.postCount);

			// Done with page
			await this.page.close();

			// Get all post details
			this.profile.posts = await this._getPostsInfo(postUrls);

			spinner.succeed(`Profile ${this.targetUsername} crawled successfully`);
		} catch (error) {
			spinner.fail('Failed to crawl profile');
			throw error;
		}
	}

	async _getSelectorsFromTemplate() {
		try {
			spinner.start("Getting crawler structure from template");
			this.selectors = await new IgersElementsFinder(this.browser).getQuerySelectors();
			spinner.succeed();
			Logger.info(this.selectors);
		} catch (error) {
			spinner.fail('Failed to crawl structure from template');
			throw error;
		}
	}

	/**
	 * Initialize headless chrome browser
	 * @returns {Promise<void>}
	 * @private
	 */
	async _initBrowser() {
		spinner.start("Initializing headless browser");
		this.browser = await puppeteer.launch({
			headless: true,
			args: ['--lang=en-US', '--disk-cache-size=0', '--no-sandbox']
		});
		spinner.succeed();
	}


	/**
	 * Ensure page response is alright
	 * @param response
	 * @private
	 */
	_assertPageSuccess(response) {
		// Close if profile doesn't exist or if error
		if (response.status() === 404) {
			spinner.fail("Profile doesn't exist");
			throw new Error("Profile doesn't exist");
		} else if (response.status() > 200) {
			spinner.fail("Error: page status is " + response.status());
			throw new Error("Error: page status is " + response.status());
		}
	}

	/**
	 * Get Profile info
	 * @param url the user profile url
	 * @returns {Promise<{url: *}>} the profile info
	 * @private
	 */
	async _getProfileInfo(url) {
		spinner.info('Getting profile info');
		try {
			let result = await this.page.evaluate(elements => {
				return {
					displayName: document.querySelector(elements.displayName).innerText,
					username: document.querySelector(elements.username).innerText,
					bio: elements.bio ? document.querySelector(elements.bio).innerText : null,
					imgUrl: elements.imgUrl ? document.querySelector(elements.imgUrl).getAttribute('src') : null,
					website: elements.website ? document.querySelector(elements.website).innerText : null,
					postCount: document.querySelector(elements.postCount) ? parseInt(document.querySelector(elements.postCount).innerHTML) : null,
					followerCount: parseInt(document.querySelector(elements.followerCount).innerText),
					followingCount: parseInt(document.querySelector(elements.followingCount).innerText),
				};
			}, this.selectors.profile);

			return {
				url: url,
				...result
			};
		} catch (err) {
			spinner.fail('Error occurred while getting profile info');
			throw err;
		}
	}

	/**
	 * Get Posts Urls
	 * @param postCount the total number of posts
	 * @private
	 */
	async _getPostsUrls(postCount) {
		spinner.start(`Get urls of posts (${postCount})!`);
		try {
			const postUrls = new Set();
			if (this.limit) {
				postCount = this.limit;
			}

			// Get posts urls
			while (postUrls.size < parseInt(postCount)) {
				const urls = await this.page.$$eval(this.selectors.profile.postUrl, list => list.map(n => n.getAttribute('href')));
				urls.forEach(url => {
					if (!this.limit || (postUrls.size < this.limit)) {
						postUrls.add(url);
					}
				});
				await this.page.evaluate(() => {
					// FIXME dirty hack to scroll and load all posts
					window.scrollTo(0, 1000000);
				});
			}
			spinner.succeed();
			return postUrls;
		} catch (e) {
			spinner.fail(`Error while getting post urls`);
			throw e;
		}
	}

	/**
	 * Get Posts info
	 * @param postUrls an array containing the post urls
	 * @returns {Promise<Array>} the posts info
	 * @private
	 */
	async _getPostsInfo(postUrls) {
		spinner.info(`Crawl all posts (${postUrls.size})!`);
		try {
			const posts = [];
			for (const url of postUrls) {
				const page = await this.browser.newPage();
				await page.goto(`https://instagram.com${url}`, {
					waitUntil: ['networkidle0', 'domcontentloaded']
				});
				spinner.info(`Will crawl post ${url}`);

				const data = await page.evaluate((url, element) => {
					return {
						url: `https://instagram.com${url}`,
						imgUrl: document.querySelector(element.img).getAttribute("src"),
						imgsetUrls: document.querySelector(element.img).getAttribute("srcset"),
						likeCount: parseInt(document.querySelector(element.likeCount).innerText),
						tags: Array.prototype.slice.call(document.querySelectorAll(element.tags)).map(v => v.innerHTML),
						description: document.querySelector(element.description) ? document.querySelector(element.description).innerText : null
					};
				}, url, this.selectors.posts);
				await page.close();
				posts.push(data);
			}
			return posts;
		} catch (e) {
			spinner.fail(`Error while crawling post`);
			throw e;
		}
	}


	// Write profile in file
	async _writeToFile() {
		if (this.output === 'yaml') {
			return writeYamlAsync(`out/${this.targetUsername}.yml`, this.profile);
		} else if (this.output === 'console') {
			console.log(JSON.stringify(this.profile));
		}
		return writeFileAsync(
				`out/${this.targetUsername}.json`,
				JSON.stringify(this.profile, null, 2)
		);
	}

};

// Create crawler and start
const crawler = new IgCrawler(cli);

crawler.start().catch(error => {
	spinner.fail();
	spinner.fail(error);
	console.error(error);
	process.exit(1);
});
