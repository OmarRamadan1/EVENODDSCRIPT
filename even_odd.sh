#!/bin/bash

echo  "********************The Script Started**************"
read -p  "enter a number to check it:" num 
if [ $(expr $num % 2) == 0 ] 
then 
   echo "Number $num is even"
else

    echo "Number $num is odd"
fi
echo "****************************************************"
