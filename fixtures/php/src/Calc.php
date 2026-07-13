<?php

class Calc
{
    public function add($a, $b)
    {
        return $a + $b;
    }

    public function divide($a, $b)
    {
        if ($b === 0) {
            throw new InvalidArgumentException('divide by zero');
        }
        return $a / $b;
    }
}
