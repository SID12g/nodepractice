const express = require('express')
const app = express()
const { MongoClient, ObjectId } = require('mongodb')
const methodeOverride = require('method-override')
const bcrypt = require('bcrypt')
const MongoStore = require('connect-mongo')
require('dotenv').config()

app.use(express.static(__dirname + '/public'))
app.set('view engine', 'ejs')
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(methodeOverride('_method'))

const session = require('express-session')
const passport = require('passport')
const LocalStrategy = require('passport-local')

app.use(passport.initialize())
app.use(session({
    secret: '암호화에 쓸 비번',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 60 * 60 * 1000 },
    store: MongoStore.create({
        mongoUrl: process.env.DB_URL,
        dbName: 'forum'
    })
}))



app.use(passport.session())

const { S3Client } = require('@aws-sdk/client-s3')
const multer = require('multer')
const multerS3 = require('multer-s3')
const s3 = new S3Client({
    region: 'ap-northeast-2',
    credentials: {
        accessKeyId: process.env.S3_KEY,
        secretAccessKey: process.env.S3_SECRET
    }
})

const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: 'sid12gbucket',
        key: function (요청, file, cb) {
            cb(null, Date.now().toString()) //업로드시 파일명 변경가능
        }
    })
})

let connectDB = require('./database.js')

let db
connectDB.then((client) => {
    console.log('DB연결성공')
    db = client.db('forum')
    app.listen(process.env.PORT, () => {
        console.log('http://localhost:8080 에서 서버 실행중')
    })
}).catch((err) => {
    console.log(err)
})

function checkLogin(요청, 응답, next) {
    if (!요청.user) {
        응답.send('로그인히세요!')
    }
    next() // 미들웨어 다음
}

app.get('/', /**checkLogin,**/(요청, 응답) => {
    // checkLogin(요청, 응답) 위에 미들웨어
    응답.sendFile(__dirname + '/index.html')
})

app.get('/news', (요청, 응답) => {
    응답.send('오늘 비옴')
})

app.get('/list', async (요청, 응답) => {
    let result = await db.collection('post').find().toArray()
    // 응답.send(result[0].title)
    응답.render('list.ejs', { 글목록: result })
})

app.get('/time', async (요청, 응답) => {
    응답.render('time.ejs', { result: new Date() })
})

app.get('/write', (요청, 응답) => {
    응답.render('write.ejs')
})

app.post('/add', upload.array('img1', 2), async (요청, 응답) => {
    // console.log(요청.body)

    console.log(요청.files.location)
    try {
        if (요청.body.title == '' || 요청.body.content == '') {
            응답.send('제목 or 컨텐츠 입력좀')
        } else {
            await db.collection('post').insertOne({
                title: 요청.body.title,
                content: 요청.body.content,
                img: 요청.file ? 요청.files.location : '',
                user:요청.user._id, 
                username:요청.user.username,
            })
            응답.redirect('/list')
        }
    } catch (e) {
        console.log(e)
        응답.status(500).send('서버 에러')
    }
})

app.get('/detail/:id', async (요청, 응답) => {
    try {
        let result = await db.collection('post').findOne({ _id: new ObjectId(요청.params.id) })
        console.log(요청.params)
        if (result == null) {
            console.log(e)
            응답.status(404).send('이상한 url')
        }
        응답.render('detail.ejs', { result: result })
    } catch (e) {
        console.log(e)
        응답.status(404).send('이상한 url')
    }
})

app.get('/edit/:id', async (요청, 응답) => {
    let result = await db.collection('post').findOne({ _id: new ObjectId(요청.params.id) })
    응답.render('edit.ejs', { result: result })
})

app.put('/edit', async (요청, 응답) => {

    // await db.collection('post').updateOne(
    //     { _id: 1 }, {$inc:{ like: 1 }
    // })
    await db.collection('post').updateOne(
        { _id: new ObjectId(요청.body.id) }, {
        $set:
            { title: 요청.body.title, content: 요청.body.content }
    }
    )
    console.log(요청.body)
    응답.redirect('/list')
})

app.get('/abc', async (요청, 응답) => {
    console.log(요청.query)
})

app.delete('/delete', async (요청, 응답) => {
    await db.collection('post').deleteOne({
         _id: new ObjectId(요청.query.docid), 
        //  user:요청.user._id //user가 doc에 정보가 있는 경우에만 현재있는 글들은 mongodb에 없음
         })
    응답.send('삭제완료')
})

app.get('/list/:id', async (요청, 응답) => {
    let result = await db.collection('post').find().skip((요청.params.id - 1) * 5).limit(5).toArray()
    응답.render('list.ejs', { 글목록: result })
})

app.get('/list/next/:id', async (요청, 응답) => {
    let result = await db.collection('post').find({ _id: { $gt: new ObjectId(요청.params.id) } }).limit(5).toArray()
    응답.render('list.ejs', { 글목록: result })
})

passport.use(new LocalStrategy(async (입력한아이디, 입력한비번, cb) => {
    let result = await db.collection('user').findOne({ username: 입력한아이디 })
    if (!result) {
        return cb(null, false, { message: '아이디 DB에 없음' })
    }
    if (await bcrypt.compare(입력한비번, result.password)) {
        return cb(null, result)
    } else {
        return cb(null, false, { message: '비번불일치' });
    }
}))

passport.serializeUser((user, done) => {
    console.log(user)
    process.nextTick(() => {
        done(null, { id: user._id, username: user.username })
    })
})
passport.deserializeUser(async (user, done) => {
    let result = await db.collection('user').findOne({ _id: new ObjectId(user.id) })
    delete result.password
    process.nextTick(() => {
        done(null, result)
    })
})

app.get('/login', async (요청, 응답) => {
    console.log(요청.user) //password 삭제 후 
    응답.render('login.ejs')
})

app.post('/login', async (요청, 응답, next) => {
    passport.authenticate('local', (error, user, info) => {
        if (error) return 응답.status(500).json(error)
        if (!user) return 응답.status(401).json(info.message)
        요청.logIn(user, (err) => {
            if (err) return next(err)
            응답.redirect('/')
        })
    })(요청, 응답, next)
})

app.get('/register', (요청, 응답) => {
    응답.render('register.ejs')
})

//register 중복 체크 해야함

app.post('/register', async (요청, 응답) => {

    let hassh = await bcrypt.hash(요청.body.password, 10)
    console.log(hassh)
    await db.collection('user').insertOne({
        username: 요청.body.username,
        password: hassh
    })
    응답.redirect('/')
})

app.use('/shop', require('./routes/shop.js'))

app.get('/search', async (요청, 응답) => {
    console.log(요청.query.val)
    let 검색조건 = [
        {
            $search: {
                index: 'title_index',
                text: { query: 요청.query.val, path: 'title' }
            }
        },
    ]
    let result = await db.collection('post')
        .aggregate(검색조건).toArray()
    응답.render('search.ejs', { 글목록: result })
})



















app.get('/about', (요청, 응답) => {
    응답.sendFile(__dirname + '/intro.html')
})

