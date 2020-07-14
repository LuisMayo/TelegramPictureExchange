# TelegramPictureExchange
Telegram Bot to exchange pics.

It works this way:
 - Alice send an image.
 - Bob sends another image.
 - The bot will now give Alice Bob's pic and Bob, Alice's pic.
 - The bot will now wait, if a third user now send an image, they will have to wait for a 4th in order to make another exchange

Running on https://t.me/picsExchangebot

## Getting Started

### Prerequisites

 - Node.js
 - A bot token. You can get one chatting with BotFather

### Installing

Clone the repository

```
git clone https://github.com/LuisMayo/TelegramPictureExchange.git
```
npm install into the cloned repo
```
npm i
```
Copy conf/conf-dummy.json into conf.json and fill the required settings.

Build the project
`tsc`
Start the project
`node build/index.js`

## Contributing
Since this is a tiny project we don't have strict rules about contributions. Just open a Pull Request to fix any of the project issues or any improvement you have percieved on your own. Any contributions which improve or fix the project will be accepted as long as they don't deviate too much from the project objectives. If you have doubts about whether the PR would be accepted or not you can open an issue before coding to ask for my opinion
