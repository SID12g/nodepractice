const router = require('express').Router()

let connectDB = require('./../database.js')

let db
connectDB.then((client) => {
    console.log('DB연결성공')
    db = client.db('forum')
}).catch((err) => {
    console.log(err)
})

router.get('/shirts', (요청, 응답) => {
    //db 명령어 가능
    응답.send('셔츠파는 페이지')
})

router.get('/pants', (요청, 응답) => {
    응답.send('바지파는 페이지')
})

module.exports = router