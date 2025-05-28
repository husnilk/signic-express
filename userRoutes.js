const express = require('express');
const router = express.Router();
const userController = require('./userController'); // Path should be correct

router.post('/', userController.createUser);
router.get('/', userController.getAllUsers);
router.get('/search', userController.searchUsers); // Added before /:id
router.get('/:id', userController.getUserById);
router.put('/:id', userController.updateUser);
router.delete('/:id', userController.deleteUser);

module.exports = router;
