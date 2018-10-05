FROM node:10-slim
MAINTAINER contact@loicortola.com

# TO BE REPLACED
ENV IGER loicortola
ENV LIMIT -1
ENV OUTPUT console

# Install latest chrome dev package and fonts to support major charsets (Chinese, Japanese, Arabic, Hebrew, Thai and a few others)
# Note: this installs the necessary libs to make the bundled version of Chromium that Puppeteer
# installs, work.
RUN apt-get update && apt-get install -y wget --no-install-recommends \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y libappindicator1 libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
										--no-install-recommends \
				&& apt-get install -y gconf-service lsb-release wget xdg-utils \
										--no-install-recommends \
				&& apt-get install -y ca-certificates \
										--no-install-recommends \
				&& apt-get install -y fonts-liberation fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst ttf-freefont \
									--no-install-recommends \
				&& rm -rf /var/lib/apt/lists/* \
    && apt-get purge --auto-remove -y curl \
    && rm -rf /src/*.deb

# It's a good idea to use dumb-init to help prevent zombie chrome processes.
ADD https://github.com/Yelp/dumb-init/releases/download/v1.2.0/dumb-init_1.2.0_amd64 /usr/local/bin/dumb-init
RUN chmod +x /usr/local/bin/dumb-init

# Add node group, user, and go to workdir
RUN usermod -aG node -aG audio -aG video node

WORKDIR /home/node/app

# Puppeteer v1.5.0 works with Chromium 69
RUN yarn global add puppeteer

# Copy current project code
COPY . .
RUN chown -R node:node /home/node
USER node
RUN yarn install

ENTRYPOINT ["dumb-init", "--"]
CMD node index $IGER --limit $LIMIT --output $OUTPUT
