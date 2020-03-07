#!/usr/bin/env node

const template = require("./template.json");

const IgersPostElementsFinder = class {
	constructor(url, browser) {
		this.url = url;
		this.browser = browser;
	}

	async getQuerySelectors() {
		// Browse new page
		this.page = await this.browser.newPage();
		await this.page.setExtraHTTPHeaders({
			'Accept-Language': 'en-US'
		});

		// Execute request
		const response = await this.page.goto(this.url, {
			waitUntil: ['networkidle0', 'domcontentloaded']
		});
		this._assertPageSuccess(response);

		// Expose classname sanitizer function
		this.page.exposeFunction("computeClassNames", this._computeClassNames);

		let posts = await this._findPostMetadata();

		await this.page.close();

		return posts;
	}


	/**
	 * Ensure page response is alright
	 * @param response
	 * @private
	 */
	_assertPageSuccess(response) {
		// Close if profile doesn't exist or if error
		if (response.status() === 404) {
			throw new Error("Profile doesn't exist");
		} else if (response.status() > 200) {
			throw new Error("Error: page status is " + response.status());
		}
	}

	/**
	 * Format classnames for querySelector
	 * @param className the classes separated by one or multiple spaces (ex: container danger hidden-xs)
	 * @returns {string} (ex: .container.danger.hidden-xs)
	 * @private
	 */
	_computeClassNames(className) {
		let cns = className.trim().split(/\s+/);
		return cns.reduce((prev, curr) => prev + "." + curr, "");
	}

	async _findPostMetadata() {
		let items = await this.page.$eval("article", async (article, conf) => {
			let r = {
				img: null,
				description: null,
				tags: null,
				likeCount: null
			};
			// Find Image URLs
			article.querySelectorAll("img").forEach(async imgElement => {
				if (imgElement.hasAttribute("alt") && imgElement.hasAttribute("srcset") && imgElement.getAttribute("alt").trim() === conf.firstPostAlt) {
					console.log(imgElement)
					r.img = "article div" + await window.computeClassNames(imgElement.parentElement.className) + " img";
				}
			});
			// Description and tags
			let ulElement = article.querySelector("ul");
			r.description = "article ul" + await window.computeClassNames(ulElement.className) + " li:first-child span";
			r.tags = "article ul" + await window.computeClassNames(ulElement.className) + " li:first-child span a";
			// Like Count
			document.querySelectorAll("article div section div div button").forEach(async likeElement => {
				if (likeElement.hasAttribute("class") && likeElement.innerText.indexOf("like") > 0) {
					r.likeCount = "article div section div div" + await window.computeClassNames(likeElement.parentElement.className) + " button";
				}
			});
			return r;
		}, template);
		if (!items || !items.img || !items.description || !items.tags || !items.likeCount) {
			console.error(items);
			throw new Error("Couldn't get img, tags, likeCount or description of post");
		}
		return items;
	}



};

module.exports = IgersPostElementsFinder;
