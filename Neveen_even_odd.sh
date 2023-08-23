read -p "Enter a number: " number

if [ $((number%2)) -eq 0 ]
then
   echo "Number is Even"
else
   echo "Nummber is Odd"
fi


