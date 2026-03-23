var express = require("express");
var router = express.Router();
let { postUserValidator, validateResult } = require('../utils/validatorHandler')
let userController = require('../controllers/users')
let cartModel = require('../schemas/cart');
let { checkLogin, checkRole } = require('../utils/authHandler.js')
let { uploadExcel } = require('../utils/uploadHandler')
let excelJS = require('exceljs')
let fs = require('fs')
let path = require('path')
let crypto = require('crypto')
let roleModel = require('../schemas/roles')
let mailHandler = require('../utils/sendMailHandler')

let userModel = require("../schemas/users");
const { default: mongoose } = require("mongoose");
//- Strong password

router.get("/", checkLogin,
  checkRole("ADMIN", "MODERATOR"), async function (req, res, next) {
    let users = await userModel
      .find({ isDeleted: false })
      .populate({
        'path': 'role',
        'select': "name"
      })
    res.send(users);
  });

router.get("/:id", checkLogin, async function (req, res, next) {
  try {
    let result = await userModel
      .find({ _id: req.params.id, isDeleted: false })
    if (result.length > 0) {
      res.send(result);
    }
    else {
      res.status(404).send({ message: "id not found" });
    }
  } catch (error) {
    res.status(404).send({ message: "id not found" });
  }
});

router.post("/",  postUserValidator, validateResult,
  async function (req, res, next) {
    let session = await mongoose.startSession()
    let transaction = session.startTransaction()
    try {
      let newItem = await userController.CreateAnUser(
        req.body.username,
        req.body.password,
        req.body.email,
        req.body.role,
        session
      )
      let newCart = new cartModel({
        user: newItem._id
      })
      let result = await newCart.save({ session })
      result = await result.populate('user')
      session.commitTransaction();
      session.endSession()
      res.send(result)
    } catch (err) {
      session.abortTransaction()
      session.endSession()
      res.status(400).send({ message: err.message });
    }
  });

router.post("/import/excel", uploadExcel.single('file'), async function (req, res, next) {
  if (!req.file) {
    return res.status(400).send({ message: "file upload rong" });
  }

  let pathFile = path.join(__dirname, '../uploads', req.file.filename);
  let workbook = new excelJS.Workbook();
  let results = [];

  try {
    await workbook.xlsx.readFile(pathFile);
    let worksheet = workbook.worksheets[0];
    let userRole = await roleModel.findOne({
      name: { $regex: /^user$/i },
      isDeleted: false
    });

    if (!userRole) {
      userRole = await roleModel.create({
        name: 'user',
        description: 'Default role for imported users'
      });
    }

    for (let index = 2; index <= worksheet.rowCount; index++) {
      let row = worksheet.getRow(index);
      let username = row.getCell(1).text.trim();
      let email = row.getCell(2).text.trim().toLowerCase();
      let rowNumber = row.number;
      let errors = [];

      if (!username) {
        errors.push("username khong duoc rong");
      }
      if (!email) {
        errors.push("email khong duoc rong");
      }
      if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        errors.push("email khong dung dinh dang");
      }

      if (errors.length > 0) {
        results.push({ row: rowNumber, success: false, errors: errors });
        continue;
      }

      let existedUser = await userModel.findOne({
        $or: [{ username: username }, { email: email }]
      });
      if (existedUser) {
        results.push({
          row: rowNumber,
          success: false,
          errors: ["username hoac email da ton tai"]
        });
        continue;
      }

      let plainPassword = crypto.randomBytes(12).toString('base64')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 16);

      if (plainPassword.length < 16) {
        plainPassword += crypto.randomBytes(16).toString('hex').slice(0, 16 - plainPassword.length);
      }

      let session = await mongoose.startSession();
      session.startTransaction();

      try {
        let newUser = await userController.CreateAnUser(
          username,
          plainPassword,
          email,
          userRole._id,
          session
        );

        let newCart = new cartModel({
          user: newUser._id
        });
        await newCart.save({ session: session });
        await session.commitTransaction();
        await session.endSession();

        let mailSent = true;
        let mailError = null;
        try {
          await mailHandler.sendNewUserPasswordMail(email, username, plainPassword);
        } catch (error) {
          mailSent = false;
          mailError = error.message;
        }

        results.push({
          row: rowNumber,
          success: true,
          user: {
            id: newUser._id,
            username: username,
            email: email,
            role: userRole.name
          },
          mailSent: mailSent,
          mailError: mailError
        });
      } catch (error) {
        await session.abortTransaction();
        await session.endSession();
        results.push({
          row: rowNumber,
          success: false,
          errors: [error.message]
        });
      }
    }

    res.send({
      file: req.file.originalname,
      totalRows: Math.max(worksheet.rowCount - 1, 0),
      successCount: results.filter(item => item.success).length,
      failedCount: results.filter(item => !item.success).length,
      results: results
    });
  } catch (error) {
    res.status(400).send({ message: error.message });
  } finally {
    if (fs.existsSync(pathFile)) {
      fs.unlinkSync(pathFile);
    }
  }
});

router.put("/:id", async function (req, res, next) {
  try {
    let id = req.params.id;
    let updatedItem = await userModel.findById(id);
    for (const key of Object.keys(req.body)) {
      updatedItem[key] = req.body[key];
    }
    await updatedItem.save();

    if (!updatedItem) return res.status(404).send({ message: "id not found" });

    let populated = await userModel
      .findById(updatedItem._id)
    res.send(populated);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

router.delete("/:id", async function (req, res, next) {
  try {
    let id = req.params.id;
    let updatedItem = await userModel.findByIdAndUpdate(
      id,
      { isDeleted: true },
      { new: true }
    );
    if (!updatedItem) {
      return res.status(404).send({ message: "id not found" });
    }
    res.send(updatedItem);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

module.exports = router;
