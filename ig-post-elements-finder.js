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
		await this.page.exposeFunction("computeClassNames", this._computeClassNames);

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
		if (!className) {
			return "";
		}
		if (className.indexOf(" ") === -1) {
			return "." + className;
		}
		let cns = className.trim().split(/\s+/);
		return cns.reduce((prev, curr) => prev + "." + curr, "");
	}

	async _findPostMetadata() {
		let items = await this.page.$eval("article", async (article, conf) => {
			let r = {
				img: null,
				video: null,
				type: null,
				description: null,
				tags: null,
				likeCount: null,
				viewCount: null
			};

			// Find Image URLs
			article.querySelectorAll("img").forEach(async imgElement => {
				if (imgElement.hasAttribute("alt") && imgElement.hasAttribute("srcset") && imgElement.getAttribute("alt").trim() === conf.photoPostAlt) {
					r.type = "image";
					r.img = "article div" + await computeClassNames(imgElement.parentElement.className) + " img";
				}
			});
			// Find Video URLs
			article.querySelectorAll("video").forEach(async videoElement => {
				if (videoElement.hasAttribute("src") && videoElement.hasAttribute("type")) {
					r.type = "video";
					r.video = "article div" + await computeClassNames(videoElement.parentElement.className) + " video";
				}
			});
			// Description and tags
			let ulElement = article.querySelector("ul");
			r.description = "article div" + await computeClassNames(ulElement.parentElement.className) + " ul li:first-child > div > div > div:nth-child(2) > span";
			r.tags = "article div" + await computeClassNames(ulElement.parentElement.className) + " ul li:first-child span a";

			// Like Count if image
			const likeElements = document.querySelectorAll("article div section div div button");
			for (let likeElement of likeElements) {
				if (likeElement.hasAttribute("class") && likeElement.innerText.indexOf("like") > 0) {
					r.likeCount = "article div section div div" + await computeClassNames(likeElement.parentElement.className) + " button";
				}
			}

			// View Count if video
			const viewElements = document.querySelectorAll("article div section div span");
			for (let viewElement of viewElements) {
				if (viewElement.hasAttribute("class") && viewElement.innerText.indexOf("view") > 0) {
					r.viewCount = "article div section div" + await computeClassNames(viewElement.parentElement.className) + " span";
				}
			}
			return r;
		}, template);
		if (!items || (!items.img && !items.video) || !items.description || !items.tags || (!items.likeCount && !items.viewCount)) {
			console.error(items);
			throw new Error("Couldn't get img, video, tags, likeCount, viewCount or description of post");
		}
		return items;
	}



};

module.exports = IgersPostElementsFinder;
