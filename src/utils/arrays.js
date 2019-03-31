const arraysAreEqual = (array1, array2) => {
	let areEqual = true

	if (array1.length != array2.length) areEqual = false; 
	else {
		const array2IncludesArray1 = array1.every(element => array2.includes(element)); 
		const array1IncludesArray2 = array2.every(element => array1.includes(element)); 
		areEqual = array1IncludesArray2 && array2IncludesArray1; 
	}
	return areEqual
}

export { arraysAreEqual }
