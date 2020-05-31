#!/usr/bin/env node
const IgersPostElementsFinder = require('./ig-post-elements-finder');

const template = require("./template.json");

const IgersElementsFinder = class {
    constructor(browser) {
        this.browser = browser;
    }

    async getQuerySelectors() {

        // Browse new page
        this.page = await this.browser.newPage();
        await this.page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US'
        });

        // Execute request
        const response = await this.page.goto(`https://instagram.com/${template.username}`, {
            waitUntil: ['networkidle0', 'domcontentloaded']
        });
        this._assertPageSuccess(response);

        // Expose classname sanitizer function
        this.page.exposeFunction("computeClassNames", this._computeClassNames);

        let profile = {
            // Find username and displayName. Both are h1 headings
            ...await this._findUsernameAndDisplayName(),
            // Find post follower and following count.
            ...await this._findPostFollowerAndFollowingCounts(),
            // Find profile picture.
            ...await this._findProfilePicture(),
            // Find bio and website.
            ...await this._findBioAndWebsite(),
            // Find post URL
            ...await this._findPostUrls()
        };

        // Get query selector for post-related data with current template

        let videoPosts = await new IgersPostElementsFinder(profile.videoPostUrl, this.browser).getQuerySelectors();
        let imgPosts = await new IgersPostElementsFinder(profile.photoPostUrl, this.browser).getQuerySelectors();

        let posts = {
        	img: imgPosts.img,
			video: videoPosts.video,
			description: imgPosts.description,
			tags: imgPosts.tags,
			likeCount: imgPosts.likeCount,
			viewCount: videoPosts.viewCount
		}
        await this.page.close();

        return {
            profile: profile,
            posts: posts
        };
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

    async _findBioAndWebsite() {
        let items = await this.page.$$eval("section", async (els) => {
            let r = {
                bio: null,
                website: null
            };
            for (let i in els) {
                if (els[i].childElementCount === 3 && els[i].children[0].tagName === "DIV" && els[i].children[1].tagName === "UL" && els[i].children[2].tagName === "DIV") {
                    let rootNode = els[i].children[2];
                    let websiteNode = rootNode.querySelector("a");
                    if (websiteNode) {
                        r.website = "div" + await window.computeClassNames(rootNode.className) + " a" + await window.computeClassNames(websiteNode.className);
                    }
                    r.bio = "div" + await window.computeClassNames(rootNode.className) + " span";
                    return r;
                }
            }
            return r;
        }, template);

        if (!items || !items.bio) {
            console.error(items);
            throw new Error("Couldn't get bio");
        }
        return items;
    }

    async _findProfilePicture() {
        let items = await this.page.$$eval("img", async (els, conf) => {
            let r = {
                imgUrl: null
            };
            for (let i in els) {
                if (els[i].hasAttribute("alt") && (els[i].getAttribute("alt").trim() === "Add a profile photo" || els[i].getAttribute("alt").trim() === conf.username + "'s profile picture")) {
                    r.imgUrl = "img" + await window.computeClassNames(els[i].className);
                    return r;
                }
            }
            return r;
        }, template);
        if (!items || !items.imgUrl) {
            console.error(items);
            throw new Error("Couldn't get profile picture");
        }
        return items;
    }


    async _findUsernameAndDisplayName() {
        let displayNameHolder = await this.page.$$eval("h1", async (h1s, conf) => {
            let r = {
                displayName: null
            };
            for (let i in h1s) {
                if (h1s[i].innerHTML === conf.displayName) {
                    r.displayName = "h1" + await window.computeClassNames(h1s[i].className);
                }
            }
            return r;
        }, template);
        let usernameHolder = await this.page.$$eval("h2", async (h2s, conf) => {
            let r = {
                username: null
            };
            for (let i in h2s) {
                if (h2s[i].innerHTML === conf.username) {
                    r.username = "h2" + await window.computeClassNames(h2s[i].className);
                }
            }
            return r;
        }, template);
        const names = {
            username: usernameHolder.username,
            displayName: displayNameHolder.displayName
        }
        if (!names.username || !names.displayName) {
            console.error(names);
            throw new Error("Couldn't get username or displayName");
        }
        return names;
    }

    async _findPostFollowerAndFollowingCounts() {
        let items = await this.page.$$eval("ul", async els => {
            let r = {
                postCount: null,
                followerCount: null,
                followingCount: null
            };
            for (let i in els) {
                if (els[i].childElementCount === 3) {
                    let parentSelector = "ul" + await window.computeClassNames(els[i].className);
                    r.postCount = parentSelector + " li:first-child span";
                    r.followerCount = parentSelector + " li:nth-child(2) span";
                    r.followingCount = parentSelector + " li:nth-child(3) span";
                }
            }
            return r;
        });
        if (!items || !items.postCount || !items.followerCount || !items.followingCount) {
            console.error(items);
            throw new Error("Couldn't get postCount or followerCount or followingCount");
        }
        return items;
    }

    async _findPostUrls() {
        let postUrls = await this.page.$$eval("img", async (els, conf) => {
            let postRootNode = null;
        	const result = {
				photoPostUrl: null,
				videoPostUrl: null,
				postRootElement: null
			}
            for (let i in els) {
            	if (!els[i].hasAttribute("alt")) {
            		continue;
				}
                if (els[i].getAttribute("alt").trim() === conf.videoPostAlt) {
                    // We need to go up the tree 4 times to get the root node for a post
                    postRootNode = els[i].parentElement.parentElement.parentElement.parentElement;
                    result.videoPostUrl = els[i].parentElement.parentElement.parentElement.getAttribute("href");
                } else if (els[i].getAttribute("alt").trim() === conf.photoPostAlt) {
					postRootNode = els[i].parentElement.parentElement.parentElement.parentElement;
					result.photoPostUrl = els[i].parentElement.parentElement.parentElement.getAttribute("href");
				}
            }
            if (!postRootNode || !result.videoPostUrl || !result.photoPostUrl) {
                return result;
            }
			result.photoPostUrl = `https://instagram.com${result.photoPostUrl}`;
			result.videoPostUrl = `https://instagram.com${result.videoPostUrl}`;
            result.postRootElement = "div" + await window.computeClassNames(postRootNode.className) + " a";
            return result;
        }, template);
        if (!postUrls) {
            throw new Error("Couldn't get url of photo or video post");
        }
		return postUrls;
    }

};

module.exports = IgersElementsFinder;
